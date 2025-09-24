// Phase 3: AI Ad Generation Service for Vercel
import { AirtableClient } from './airtableClient.js';
import Anthropic from '@anthropic-ai/sdk';

export class AdGenerationService {
  constructor() {
    this.airtable = new AirtableClient();
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async generateAdVariants({ adId, campaignId, adGroupId, campaignName, adGroupName, finalUrl }) {
    try {
      console.log(`Starting ad generation for Ad ID: ${adId}`);

      // 1. Collect target keywords for context
      const targetKeywords = await this.getTargetKeywords({ campaignId, adGroupId });

      // 2. Generate variants using Claude (no source ad content)
      const variants = await this.generateWithClaude({
        campaignName,
        adGroupName,
        finalUrl,
        targetKeywords
      });

      // 4. Validate generated content
      const validatedVariants = variants.map(variant => this.validateAdCopy(variant));

      // 5. Create records in Airtable
      const adGeneratorRecords = await this.createAdGeneratorRecords({
        campaignId,
        adGroupId,
        variants: validatedVariants,
        campaignName,
        adGroupName,
        adId,
        finalUrl
      });

      console.log(`Generated ${validatedVariants.length} variants, created ${adGeneratorRecords.length} Ad Generator records`);

      return {
        variantsGenerated: validatedVariants.length,
        adGeneratorRecords: adGeneratorRecords.length,
        variants: validatedVariants
      };

    } catch (error) {
      console.error('Error in generateAdVariants:', error);
      throw error;
    }
  }

  async getTargetKeywords({ campaignId, adGroupId }) {
    try {
      // Try to pull top keywords by Ad Group first, fallback to Campaign
      let records = [];
      if (adGroupId) {
        records = await this.airtable.getRecords('Keywords', {
          filterByFormula: `{Ad Group ID} = "${adGroupId}"`,
          maxRecords: 15
        });
      }
      if ((!records || records.length === 0) && campaignId) {
        records = await this.airtable.getRecords('Keywords', {
          filterByFormula: `{Campaign ID} = "${campaignId}"`,
          maxRecords: 15
        });
      }
      const texts = (records || []).map(r => r.get('Keyword Text')).filter(Boolean);
      // Deduplicate and trim
      const unique = Array.from(new Set(texts.map(t => String(t).trim()))).slice(0, 15);
      return unique;
    } catch (err) {
      console.error('Error fetching target keywords:', err);
      return [];
    }
  }

  async getSourceAdContent(adId) {
    try {
      // Get the source ad record from Airtable
      const records = await this.airtable.getRecords('Ads', {
        filterByFormula: `{Ad ID} = "${adId}"`
      });

      if (records.length === 0) {
        console.log(`No source ad found for ID: ${adId}`);
        return null;
      }

      const record = records[0];
      return {
        headlines: record.get('Headlines') || '',
        descriptions: record.get('Descriptions') || '',
        path1: record.get('Path1') || '',
        path2: record.get('Path2') || ''
      };

    } catch (error) {
      console.error('Error fetching source ad content:', error);
      return null;
    }
  }

  async generateWithClaude({ campaignName, adGroupName, finalUrl, targetKeywords }) {
    try {
      const prompt = this.buildPrompt({
        campaignName,
        adGroupName,
        finalUrl,
        targetKeywords
      });
      const response = await this.anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest',
        max_tokens: Math.min(Number(process.env.CLAUDE_MAX_TOKENS || 1200), 4000),
        temperature: Number(process.env.CLAUDE_TEMPERATURE || 0.9),
        messages: [
          { role: 'user', content: prompt }
        ]
      });

      const content = (response?.content || [])
        .map(p => (typeof p === 'string' ? p : (p.text || '')))
        .join('\n');
      try {
        const variants = this.parseClaudeResponse(content);
        // Check for similarities and retry if needed
        if (this.hasSimilarContent(variants)) {
          console.log('Similar content detected, retrying with different approach...');
          return await this.generateWithClaudeRetry({ campaignName, adGroupName, finalUrl, targetKeywords }, variants);
        }
        // Enforce variety by checking for similarities
        const uniqueVariants = this.enforceVariety(variants);
        return uniqueVariants;
      } catch (parseErr) {
        const snippet = String(content).slice(0, 600);
        console.warn('Claude output (first 600 chars):\n' + snippet);
        // Ask Claude to reformat strictly into required line format
        const reformatPrompt = [
          'Reformat the following content into EXACTLY this plain-text format with no extra commentary, no markdown, no JSON:',
          'VARIANT 1: [Strategy Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]',
          'VARIANT 2: [Strategy Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]',
          'VARIANT 3: [Strategy Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]',
          'Only output three VARIANT lines exactly as specified. Do not include any other lines.',
          '--- CONTENT TO REFORMAT START ---',
          snippet,
          '--- CONTENT TO REFORMAT END ---'
        ].join('\n');
        const reformatRes = await this.anthropic.messages.create({
          model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest',
          max_tokens: 800,
          temperature: 0.2,
          messages: [ { role: 'user', content: reformatPrompt } ]
        });
        const reformatted = (reformatRes?.content || [])
          .map(p => (typeof p === 'string' ? p : (p.text || '')))
          .join('\n');
        return this.parseClaudeResponse(reformatted);
      }

    } catch (error) {
      console.error('Claude generation error:', error);
      throw new Error(`Claude generation failed: ${error.message}`);
    }
  }

  buildPrompt({ campaignName, adGroupName, finalUrl, targetKeywords }) {
    const keywords = (targetKeywords || []).join(', ');

    const lines = [];
    lines.push('Generate 3 optimized Google Ads variants based on the destination URL and landing page type.');
    lines.push('ABSOLUTE REQUIREMENT: Each variant must be COMPLETELY DIFFERENT from the others.');
    lines.push('');
    lines.push('DESTINATION URL ANALYSIS');
    lines.push('First, analyze the destination URL to determine the site type and adapt strategy accordingly:');
    lines.push('');
    lines.push('Site Type Detection:');
    lines.push('- E-commerce/Direct Sales: Product pages, checkout flows, brand websites');
    lines.push('- Lead Generation: Contact forms, quote requests, consultation bookings');
    lines.push('- Review/Comparison Sites: Independent reviews, "best of" lists, product comparisons');
    lines.push('- Service Providers: Local businesses, professional services, SaaS platforms');
    lines.push('- Content/Information: Blogs, guides, educational resources');
    lines.push('');
    lines.push('URL-Based Strategy Adaptation:');
    lines.push('Based on the detected site type, adjust messaging focus:');
    lines.push('- E-commerce/Direct Sales: Emphasize product benefits, pricing, promotions');
    lines.push('  Use action words: "Buy," "Shop," "Save," "Get"');
    lines.push('  Highlight guarantees, shipping, return policies');
    lines.push('- Lead Generation: Focus on consultation value, expertise, problem-solving');
    lines.push('  Use discovery words: "Learn," "Discover," "Find Out"');
    lines.push('  Emphasize free consultations, quotes, assessments');
    lines.push('- Review/Comparison Sites: Lead with authority and independence: "Expert-Tested," "Unbiased Review"');
    lines.push('  Highlight comparison value: "We Tested 50+," "#1 Ranked"');
    lines.push('  Use research-oriented language: "Best Choice," "Top Rated," "Winner"');
    lines.push('- Service Providers: Emphasize expertise, local presence, results');
    lines.push('  Include trust signals: years in business, certifications');
    lines.push('  Focus on outcomes and customer success');
    lines.push('- Content/Information: Lead with valuable insights or solutions');
    lines.push('  Use educational language: "Complete Guide," "Expert Tips"');
    lines.push('  Emphasize comprehensiveness and authority');
    lines.push('');
    lines.push('CRITICAL VARIETY REQUIREMENTS:');
    lines.push('1. NO WORD REPETITION: Each headline must use completely different words (except target keywords)');
    lines.push('2. NO STRUCTURE REPETITION: Each variant must use different sentence patterns');
    lines.push('3. NO PHRASE REPETITION: No similar phrases across variants');
    lines.push('4. NO CONCEPT REPETITION: Each variant must focus on different benefits/angles');
    lines.push('5. NO FORMAT REPETITION: Mix questions, statements, commands, numbers, exclamations');
    lines.push('');
    lines.push('ADAPTIVE VARIANT STRATEGIES');
    lines.push('The three variants will adapt based on the detected site type:');
    lines.push('');
    lines.push('For E-commerce/Direct Sales:');
    lines.push('- Variant 1: Product-focused (features, benefits, differentiators)');
    lines.push('- Variant 2: Offer-focused (deals, promotions, value propositions)');
    lines.push('- Variant 3: Urgency-focused (limited time, scarcity, immediate action)');
    lines.push('');
    lines.push('For Lead Generation:');
    lines.push('- Variant 1: Problem-solution focused');
    lines.push('- Variant 2: Expertise/authority focused');
    lines.push('- Variant 3: Free value/consultation focused');
    lines.push('');
    lines.push('For Review/Comparison Sites:');
    lines.push('- Variant 1: Authority-focused ("Expert Review Reveals...")');
    lines.push('- Variant 2: Comparison-focused ("We Tested X Options - This Won")');
    lines.push('- Variant 3: Result-focused ("See Our #1 Recommendation")');
    lines.push('');
    lines.push('For Service Providers:');
    lines.push('- Variant 1: Experience/credibility focused');
    lines.push('- Variant 2: Results/outcome focused');
    lines.push('- Variant 3: Local/availability focused');
    lines.push('');
    lines.push('For Content/Information:');
    lines.push('- Variant 1: Educational value focused');
    lines.push('- Variant 2: Comprehensive resource focused');
    lines.push('- Variant 3: Expert insight focused');
    lines.push('');
    lines.push('MANDATORY VARIANT DIFFERENTIATION:');
    lines.push('VARIANT 1 - EMOTIONAL PROBLEM FOCUS:');
    lines.push('Headline 1: Question about problem (max 30 chars)');
    lines.push('Headline 2: Emotional benefit/solution (max 30 chars)');
    lines.push('Headline 3: Social proof/authority (max 30 chars)');
    lines.push('Description 1: Problem-focused with empathy (max 90 chars)');
    lines.push('Description 2: Solution-focused with guarantee (max 90 chars)');
    lines.push('Tone: Empathetic, understanding, supportive');
    lines.push('Words to use: "Struggling", "Finally", "Relief", "Support", "Help"');
    lines.push('');
    lines.push('VARIANT 2 - SCIENTIFIC/AUTHORITY FOCUS:');
    lines.push('Headline 1: Scientific/clinical claim (max 30 chars)');
    lines.push('Headline 2: Specific benefit with number (max 30 chars)');
    lines.push('Headline 3: Expert endorsement (max 30 chars)');
    lines.push('Description 1: Research-backed with data (max 90 chars)');
    lines.push('Description 2: Clinical proof with results (max 90 chars)');
    lines.push('Tone: Professional, authoritative, evidence-based');
    lines.push('Words to use: "Clinically", "Proven", "Research", "Study", "Doctor"');
    lines.push('');
    lines.push('VARIANT 3 - URGENCY/ACTION FOCUS:');
    lines.push('Headline 1: Urgent action command (max 30 chars)');
    lines.push('Headline 2: Limited time offer (max 30 chars)');
    lines.push('Headline 3: Immediate benefit (max 30 chars)');
    lines.push('Description 1: Urgency with scarcity (max 90 chars)');
    lines.push('Description 2: Action with immediate result (max 90 chars)');
    lines.push('Tone: Urgent, action-oriented, time-sensitive');
    lines.push('Words to use: "Now", "Today", "Limited", "Act", "Quick"');
    lines.push('');
    lines.push('HEADLINE STRUCTURE REQUIREMENTS:');
    lines.push('Variant 1: Question → Benefit → Proof');
    lines.push('Variant 2: Claim → Number → Authority');
    lines.push('Variant 3: Command → Offer → Result');
    lines.push('');
    lines.push('DESCRIPTION STRUCTURE REQUIREMENTS:');
    lines.push('Variant 1: Problem → Solution → Guarantee');
    lines.push('Variant 2: Research → Results → Proof');
    lines.push('Variant 3: Urgency → Benefit → Action');
    lines.push('');
    lines.push('WORD REPLACEMENT DICTIONARY:');
    lines.push('Instead of "Low" use: "Decreased", "Reduced", "Diminished", "Weakened"');
    lines.push('Instead of "Sex Drive" use: "Libido", "Desire", "Passion", "Intimacy"');
    lines.push('Instead of "Natural" use: "Herbal", "Organic", "Plant-based", "Holistic"');
    lines.push('Instead of "Help" use: "Solution", "Support", "Aid", "Assistance"');
    lines.push('Instead of "Top 5" use: "Best", "Leading", "Proven", "Recommended"');
    lines.push('Instead of "Enhancers" use: "Boosters", "Improvers", "Restorers", "Activators"');
    lines.push('Instead of "2025" use: "This Year", "Now", "Today", "Latest"');
    lines.push('Instead of "Struggling" use: "Battling", "Fighting", "Dealing", "Coping"');
    lines.push('Instead of "Clinically" use: "Scientifically", "Medically", "Research-proven", "Tested"');
    lines.push('Instead of "Desire" use: "Passion", "Intimacy", "Libido", "Drive"');
    lines.push('');
    lines.push('FORMAT REQUIREMENTS');
    lines.push('Technical Specifications:');
    lines.push('- 3 Headlines per variant (max 30 characters each)');
    lines.push('- 2 Descriptions per variant (max 90 characters each)');
    lines.push('- Path1 & Path2 suggestions (max 15 characters each, should reflect URL structure)');
    lines.push('');
    lines.push('Content Guidelines:');
    lines.push('Headlines:');
    lines.push('- Front-load primary keywords and value props');
    lines.push('- Include numbers, percentages, or specific benefits when possible');
    lines.push('- Adapt tone to site type (authoritative for reviews, action-oriented for e-commerce)');
    lines.push('- Ensure brand/site name fits if space allows');
    lines.push('');
    lines.push('Descriptions:');
    lines.push('- Elaborate on headline promises with specific, relevant details');
    lines.push('- Include appropriate trust signals based on site type:');
    lines.push('  * E-commerce: guarantees, shipping, returns');
    lines.push('  * Reviews: independence, testing methodology, sample size');
    lines.push('  * Services: certifications, experience, local presence');
    lines.push('  * Lead gen: free consultations, no obligation');
    lines.push('- End with compelling, site-appropriate call-to-action');
    lines.push('');
    lines.push('Display Paths:');
    lines.push('- Mirror the destination URL structure when possible');
    lines.push('- Use site-type appropriate categorization');
    lines.push('- Support the ad\'s primary message');
    lines.push('');
    lines.push('SITE-SPECIFIC TRUST SIGNALS');
    lines.push('- E-commerce: Free shipping, money-back guarantee, secure checkout, customer reviews');
    lines.push('- Review Sites: Independent testing, unbiased analysis, expert methodology, sample sizes');
    lines.push('- Lead Generation: Free consultation, no obligation, certified experts, local presence');
    lines.push('- Service Providers: Licensed/insured, years of experience, satisfaction guarantee, local');
    lines.push('- Content Sites: Expert authored, comprehensive coverage, updated information, trusted source');
    lines.push('');
    lines.push('FORBIDDEN SIMILARITIES:');
    lines.push('- Do NOT repeat any words across variants (except target keywords)');
    lines.push('- Do NOT use similar sentence structures');
    lines.push('- Do NOT use similar phrases or patterns');
    lines.push('- Do NOT create variants that differ by only 1-2 words');
    lines.push('- Do NOT use the same approach for multiple variants');
    lines.push('');
    lines.push('QUALITY CHECKLIST');
    lines.push('- Site type correctly identified and strategy adapted');
    lines.push('- All character limits respected');
    lines.push('- No repetitive language across variants');
    lines.push('- Google Ads policy compliant');
    lines.push('- Clear value proposition matching site purpose');
    lines.push('- Keywords naturally integrated');
    lines.push('- Trust signals appropriate for site type');
    lines.push('- CTAs align with destination page intent');
    lines.push('- Mobile-friendly readability');
    lines.push('');
    lines.push('OUTPUT FORMAT (EXACT):');
    lines.push('DETECTED SITE TYPE: [Site Type]');
    lines.push('VARIANT 1: [Approach Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('VARIANT 2: [Approach Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('VARIANT 3: [Approach Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('');
    lines.push('INPUT DATA:');
    lines.push(`DESTINATION URL: ${finalUrl || ''}`);
    lines.push(`TARGET KEYWORDS: ${(targetKeywords || []).join(', ')}`);
    lines.push(`CAMPAIGN FOCUS: ${[campaignName, adGroupName].filter(Boolean).join(' - ')}`);
    lines.push('');
    lines.push('FINAL REMINDER: Each variant must be 100% unique. No similarities in words, structure, or approach allowed.');
    lines.push('');
    lines.push('RANDOMIZATION REQUIREMENT:');
    lines.push(`Generate unique content for this specific request. Use different words, phrases, and approaches than any previous generation.`);
    lines.push(`Request ID: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

    return lines.join('\n');
  }

  hasSimilarContent(variants) {
    if (!variants || variants.length < 3) return false;
    
    // Collect all headlines and descriptions
    const allHeadlines = [];
    const allDescriptions = [];
    
    variants.forEach(variant => {
      allHeadlines.push(...variant.headlines);
      allDescriptions.push(...variant.descriptions);
    });
    
    // Check for identical headlines within the same generation
    for (let i = 0; i < allHeadlines.length; i++) {
      for (let j = i + 1; j < allHeadlines.length; j++) {
        if (allHeadlines[i].toLowerCase().trim() === allHeadlines[j].toLowerCase().trim()) {
          console.log(`Identical headlines detected: "${allHeadlines[i]}" appears multiple times`);
          return true;
        }
      }
    }
    
    // Check for identical descriptions within the same generation
    for (let i = 0; i < allDescriptions.length; i++) {
      for (let j = i + 1; j < allDescriptions.length; j++) {
        if (allDescriptions[i].toLowerCase().trim() === allDescriptions[j].toLowerCase().trim()) {
          console.log(`Identical descriptions detected: "${allDescriptions[i]}" appears multiple times`);
          return true;
        }
      }
    }
    
    // Check for similar headlines between variants
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        const h1 = variants[i].headlines.join(' ').toLowerCase();
        const h2 = variants[j].headlines.join(' ').toLowerCase();
        
        // Check if headlines are too similar (more than 70% word overlap)
        const words1 = h1.split(/\s+/).filter(w => w.length > 3);
        const words2 = h2.split(/\s+/).filter(w => w.length > 3);
        const commonWords = words1.filter(word => words2.includes(word));
        const similarity = commonWords.length / Math.max(words1.length, words2.length);
        
        if (similarity > 0.7) {
          console.log(`Similar headlines detected: "${h1}" vs "${h2}" (${Math.round(similarity * 100)}% similar)`);
          return true;
        }
      }
    }
    
    // Check for similar descriptions between variants
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        const d1 = variants[i].descriptions.join(' ').toLowerCase();
        const d2 = variants[j].descriptions.join(' ').toLowerCase();
        
        if (d1 === d2) {
          console.log(`Identical descriptions detected: "${d1}"`);
          return true;
        }
      }
    }
    
    return false;
  }

  async generateWithClaudeRetry({ campaignName, adGroupName, finalUrl, targetKeywords }, previousVariants) {
    const retryPrompt = this.buildRetryPrompt({ campaignName, adGroupName, finalUrl, targetKeywords }, previousVariants);
    
    const response = await this.anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest',
      max_tokens: Math.min(Number(process.env.CLAUDE_MAX_TOKENS || 1200), 4000),
      temperature: 1.0, // Maximum creativity for retry
      messages: [
        { role: 'user', content: retryPrompt }
      ]
    });

    const content = (response?.content || [])
      .map(p => (typeof p === 'string' ? p : (p.text || '')))
      .join('\n');
    
    const variants = this.parseClaudeResponse(content);
    return this.enforceVariety(variants);
  }

  buildRetryPrompt({ campaignName, adGroupName, finalUrl, targetKeywords }, previousVariants) {
    const keywords = (targetKeywords || []).join(', ');
    
    const lines = [];
    lines.push('CRITICAL: The previous generation was too similar. Generate COMPLETELY DIFFERENT variants.');
    lines.push('');
    lines.push('FORBIDDEN CONTENT (DO NOT USE ANY OF THESE):');
    previousVariants.forEach((variant, index) => {
      lines.push(`Variant ${index + 1} - DO NOT REPEAT:`);
      lines.push(`Headlines: ${variant.headlines.join(' | ')}`);
      lines.push(`Descriptions: ${variant.descriptions.join(' | ')}`);
      lines.push('');
    });
    lines.push('');
    lines.push('MANDATORY REQUIREMENTS:');
    lines.push('1. Use COMPLETELY DIFFERENT words than the forbidden content above');
    lines.push('2. Use DIFFERENT sentence structures');
    lines.push('3. Use DIFFERENT approaches (problem vs solution vs urgency vs authority)');
    lines.push('4. Use DIFFERENT emotional triggers');
    lines.push('5. Use DIFFERENT value propositions');
    lines.push('');
    lines.push('WORD REPLACEMENT REQUIREMENTS:');
    lines.push('Instead of common words, use these alternatives:');
    lines.push('- "Low" → "Decreased", "Reduced", "Diminished", "Weakened"');
    lines.push('- "Sex Drive" → "Libido", "Desire", "Passion", "Intimacy"');
    lines.push('- "Natural" → "Herbal", "Organic", "Plant-based", "Holistic"');
    lines.push('- "Help" → "Solution", "Support", "Aid", "Assistance"');
    lines.push('- "Top 5" → "Best", "Leading", "Proven", "Recommended"');
    lines.push('- "Enhancers" → "Boosters", "Improvers", "Restorers", "Activators"');
    lines.push('- "2025" → "This Year", "Now", "Today", "Latest"');
    lines.push('- "Struggling" → "Battling", "Fighting", "Dealing", "Coping"');
    lines.push('- "Clinically" → "Scientifically", "Medically", "Research-proven", "Tested"');
    lines.push('');
    lines.push('APPROACH VARIATIONS:');
    lines.push('Variant 1: Problem-focused with empathy');
    lines.push('Variant 2: Scientific/authority-focused');
    lines.push('Variant 3: Urgency/action-focused');
    lines.push('');
    lines.push('OUTPUT FORMAT (EXACT):');
    lines.push('DETECTED SITE TYPE: [Site Type]');
    lines.push('VARIANT 1: [Approach Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('VARIANT 2: [Approach Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('VARIANT 3: [Approach Name] Headlines: [H1] | [H2] | [H3] Descriptions: [D1] | [D2] Paths: [Path1] / [Path2]');
    lines.push('');
    lines.push('INPUT DATA:');
    lines.push(`DESTINATION URL: ${finalUrl || ''}`);
    lines.push(`TARGET KEYWORDS: ${(targetKeywords || []).join(', ')}`);
    lines.push(`CAMPAIGN FOCUS: ${[campaignName, adGroupName].filter(Boolean).join(' - ')}`);
    lines.push('');
    lines.push('REMEMBER: Generate content that is 100% different from the forbidden content above.');
    
    return lines.join('\n');
  }

  enforceVariety(variants) {
    if (!variants || variants.length < 3) return variants;
    
    const modifiedVariants = [...variants];
    
    // Check for word repetition across variants
    const allWords = new Set();
    const wordCounts = {};
    
    for (let i = 0; i < modifiedVariants.length; i++) {
      const variant = modifiedVariants[i];
      const allText = [...variant.headlines, ...variant.descriptions].join(' ').toLowerCase();
      const words = allText.split(/\s+/).filter(w => w.length > 3); // Only check words longer than 3 chars
      
      for (const word of words) {
        if (wordCounts[word]) {
          wordCounts[word]++;
        } else {
          wordCounts[word] = 1;
        }
      }
    }
    
    // Replace repeated words with alternatives
    const wordReplacements = {
      'low': ['decreased', 'reduced', 'diminished', 'weakened'],
      'sex': ['intimacy', 'passion', 'desire', 'libido'],
      'drive': ['desire', 'passion', 'libido', 'intimacy'],
      'natural': ['herbal', 'organic', 'plant-based', 'holistic'],
      'help': ['solution', 'support', 'aid', 'assistance'],
      'top': ['best', 'leading', 'proven', 'recommended'],
      'enhancers': ['boosters', 'improvers', 'restorers', 'activators'],
      'struggling': ['battling', 'fighting', 'dealing', 'coping'],
      'clinically': ['scientifically', 'medically', 'research-proven', 'tested'],
      'desire': ['passion', 'intimacy', 'libido', 'drive'],
      'boost': ['enhance', 'improve', 'increase', 'restore'],
      'guide': ['solution', 'method', 'approach', 'system'],
      'women': ['female', 'ladies', 'her', 'she'],
      'health': ['wellness', 'vitality', 'wellbeing', 'fitness']
    };
    
    // Apply replacements to reduce repetition
    for (let i = 0; i < modifiedVariants.length; i++) {
      const variant = modifiedVariants[i];
      
      // Modify headlines - force different words for each variant
      variant.headlines = variant.headlines.map(headline => {
        let modified = headline.toLowerCase();
        for (const [word, alternatives] of Object.entries(wordReplacements)) {
          if (modified.includes(word)) {
            // Always use different alternative for each variant
            const replacement = alternatives[i % alternatives.length];
            modified = modified.replace(new RegExp(word, 'g'), replacement);
          }
        }
        return modified.charAt(0).toUpperCase() + modified.slice(1);
      });
      
      // Modify descriptions - force different words for each variant
      variant.descriptions = variant.descriptions.map(description => {
        let modified = description.toLowerCase();
        for (const [word, alternatives] of Object.entries(wordReplacements)) {
          if (modified.includes(word)) {
            // Always use different alternative for each variant
            const replacement = alternatives[i % alternatives.length];
            modified = modified.replace(new RegExp(word, 'g'), replacement);
          }
        }
        return modified.charAt(0).toUpperCase() + modified.slice(1);
      });
    }
    
    // Final check: ensure no duplicates remain
    const finalVariants = this.ensureNoDuplicates(modifiedVariants);
    
    console.log('Applied variety enforcement to variants');
    return finalVariants;
  }

  ensureNoDuplicates(variants) {
    if (!variants || variants.length < 3) return variants;
    
    const finalVariants = [...variants];
    const usedHeadlines = new Set();
    const usedDescriptions = new Set();
    
    // Headline alternatives for common patterns
    const headlineAlternatives = {
      'success rate': ['success rate', 'effectiveness rate', 'improvement rate', 'positive results'],
      'proven': ['proven', 'tested', 'verified', 'confirmed'],
      'today': ['today', 'now', 'immediately', 'instantly'],
      'rediscover': ['rediscover', 'restore', 'revive', 'renew'],
      'passion': ['passion', 'desire', 'intimacy', 'connection']
    };
    
    // Description alternatives
    const descriptionAlternatives = {
      'success rate': ['success rate', 'effectiveness rate', 'improvement rate', 'positive results'],
      'proven': ['proven', 'tested', 'verified', 'confirmed'],
      'today': ['today', 'now', 'immediately', 'instantly']
    };
    
    for (let i = 0; i < finalVariants.length; i++) {
      const variant = finalVariants[i];
      
      // Fix duplicate headlines
      for (let j = 0; j < variant.headlines.length; j++) {
        let headline = variant.headlines[j];
        let counter = 1;
        
        while (usedHeadlines.has(headline.toLowerCase().trim())) {
          // Try to make it unique by adding/modifying words
          const lowerHeadline = headline.toLowerCase();
          let modified = headline;
          
          // Try different alternatives
          for (const [pattern, alternatives] of Object.entries(headlineAlternatives)) {
            if (lowerHeadline.includes(pattern)) {
              const altIndex = counter % alternatives.length;
              modified = headline.replace(new RegExp(pattern, 'gi'), alternatives[altIndex]);
              break;
            }
          }
          
          // If still duplicate, add a number or modify
          if (usedHeadlines.has(modified.toLowerCase().trim())) {
            modified = headline + ` ${counter}`;
          }
          
          headline = modified;
          counter++;
        }
        
        variant.headlines[j] = headline;
        usedHeadlines.add(headline.toLowerCase().trim());
      }
      
      // Fix duplicate descriptions
      for (let j = 0; j < variant.descriptions.length; j++) {
        let description = variant.descriptions[j];
        let counter = 1;
        
        while (usedDescriptions.has(description.toLowerCase().trim())) {
          // Try to make it unique by adding/modifying words
          const lowerDescription = description.toLowerCase();
          let modified = description;
          
          // Try different alternatives
          for (const [pattern, alternatives] of Object.entries(descriptionAlternatives)) {
            if (lowerDescription.includes(pattern)) {
              const altIndex = counter % alternatives.length;
              modified = description.replace(new RegExp(pattern, 'gi'), alternatives[altIndex]);
              break;
            }
          }
          
          // If still duplicate, add a number or modify
          if (usedDescriptions.has(modified.toLowerCase().trim())) {
            modified = description + ` ${counter}`;
          }
          
          description = modified;
          counter++;
        }
        
        variant.descriptions[j] = description;
        usedDescriptions.add(description.toLowerCase().trim());
      }
    }
    
    console.log('Ensured no duplicate headlines or descriptions');
    return finalVariants;
  }

  parseClaudeResponse(content) {
    try {
      if (!content || typeof content !== 'string') {
        throw new Error('Empty response content');
      }
      const text = content.trim();

      // Strategy A: Direct VARIANT lines
      const blocks = text.match(/VARIANT\s*\d:[\s\S]*?(?=(\nVARIANT\s*\d:|$))/gi) || [];
      const collectFromBlocks = () => {
        const variants = [];
        for (const block of blocks) {
          const h = (block.match(/Headlines:\s*([^\n]+)/i)?.[1] || '').split('|').map(s => s.trim()).filter(Boolean).slice(0,3);
          const d = (block.match(/Descriptions:\s*([^\n]+)/i)?.[1] || '').split('|').map(s => s.trim()).filter(Boolean).slice(0,2);
          const pLine = block.match(/Paths?:\s*([^\n]+)/i)?.[1] || '';
          const p = pLine.split('/').map(s => s.trim()).filter(Boolean);
          const path1 = (p[0] || '').slice(0,15);
          const path2 = (p[1] || '').slice(0,15);
          if (h.length === 3 && d.length === 2) {
            variants.push({ headlines: h, descriptions: d, path1, path2 });
          }
        }
        return variants;
      };
      let variants = collectFromBlocks();

      // Strategy B: JSON fallback if present
      if (!variants.length) {
        const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const obj = JSON.parse(jsonMatch[0]);
            const arr = Array.isArray(obj) ? obj : (obj.variants || []);
            const mapped = (arr || []).map(v => ({
              headlines: (v.headlines || []).slice(0,3).map(String),
              descriptions: (v.descriptions || []).slice(0,2).map(String),
              path1: String(v.path1 || '').slice(0,15),
              path2: String(v.path2 || '').slice(0,15)
            })).filter(v => v.headlines.length === 3 && v.descriptions.length === 2);
            if (mapped.length) variants = mapped;
          } catch { /* ignore */ }
        }
      }

      // Strategy C: Heuristic lines (Headlines:, Descriptions:, Paths:) anywhere
      if (!variants.length) {
        const variantLike = text.split(/\n\s*\n/).filter(s => /Headlines:/i.test(s) && /Descriptions:/i.test(s));
        const mapped = variantLike.slice(0,3).map(block => {
          const h = (block.match(/Headlines:\s*([^\n]+)/i)?.[1] || '').split('|').map(s => s.trim()).filter(Boolean).slice(0,3);
          const d = (block.match(/Descriptions:\s*([^\n]+)/i)?.[1] || '').split('|').map(s => s.trim()).filter(Boolean).slice(0,2);
          const p = (block.match(/Paths?:\s*([^\n]+)/i)?.[1] || '').split('/').map(s => s.trim()).filter(Boolean);
          const path1 = (p[0] || '').slice(0,15);
          const path2 = (p[1] || '').slice(0,15);
          if (h.length === 3 && d.length === 2) {
            return { headlines: h, descriptions: d, path1, path2 };
          }
          return null;
        }).filter(Boolean);
        if (mapped.length) variants = mapped;
      }

      if (!variants.length) throw new Error('Failed to extract variants');
      return variants;
    } catch (error) {
      console.error('Error parsing Claude response:', error);
      throw new Error(`Failed to parse Claude response: ${error.message}`);
    }
  }

  async createAdGeneratorRecords({ campaignId, adGroupId, variants, campaignName, adGroupName, adId, finalUrl }) {
    try {
      const records = variants.map((variant, index) => ({
        fields: {
          'Campaign ID': campaignId,
          'Ad Group ID': adGroupId,
          'Campaign Name': campaignName || '',
          'Ad Group Name': adGroupName || '',
          'Source Ad ID': adId,
          'Headline 1': variant.headlines[0] || '',
          'Headline 2': variant.headlines[1] || '',
          'Headline 3': variant.headlines[2] || '',
          'Description 1': variant.descriptions[0] || '',
          'Description 2': variant.descriptions[1] || '',
          'Path1': variant.path1 || '',
          'Path2': variant.path2 || '',
          'Final URL': finalUrl || '',
          'To Upload Table': false,
          'Validation Status': '✅ Ready',
          'Generation Status': 'Generated',
          'Created At': new Date().toISOString()
        }
      }));

      const createdRecords = await this.airtable.createRecords('Ad Generator', records);
      console.log(`Created ${createdRecords.length} Ad Generator records`);
      return createdRecords;

    } catch (error) {
      console.error('Error creating Ad Generator records:', error);
      throw error;
    }
  }


  validateAdCopy(variant) {
    // Validate headlines (max 30 characters each)
    const validatedHeadlines = variant.headlines.map(headline => {
      if (headline.length > 30) {
        console.warn(`Headline too long (${headline.length} chars): ${headline}`);
        return headline.substring(0, 30);
      }
      return headline;
    });

    // Validate descriptions (max 90 characters each)
    const validatedDescriptions = variant.descriptions.map(description => {
      if (description.length > 90) {
        console.warn(`Description too long (${description.length} chars): ${description}`);
        return description.substring(0, 90);
      }
      return description;
    });

    return {
      ...variant,
      headlines: validatedHeadlines,
      descriptions: validatedDescriptions
    };
  }
}
