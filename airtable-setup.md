# Airtable Setup - Master Date Control

## New Table Structure

### 1. "Set Date" Table (Master Control)
Create a new table called "Set Date" with these fields:

| Field Name | Field Type | Description |
|------------|------------|-------------|
| **Master Start Date** | Date | Start date for all data pulls |
| **Master End Date** | Date | End date for all data pulls |
| **Pull Data Button** | Button | Triggers data pull for all campaigns |
| **Last Pull Status** | Single Line Text | Shows last pull status (Success/Error) |
| **Last Pull Time** | Date & Time | When the last data pull was executed |
| **Records Updated** | Number | How many total records were updated |
| **Status** | Single Select | Options: Ready, Pulling, Success, Error |

### 2. Updated Campaigns Table
Remove these fields from Campaigns table:
- ❌ Start Date
- ❌ End Date

Keep all other existing fields.

### 3. Updated Ad Groups Table
Remove these fields from Ad Groups table:
- ❌ Start Date  
- ❌ End Date

Keep all other existing fields.

### 4. Updated Keywords Table
Remove these fields from Keywords table:
- ❌ Start Date
- ❌ End Date

Keep all other existing fields.

### 5. Updated Ads Table
Remove these fields from Ads table:
- ❌ Start Date
- ❌ End Date

Keep all other existing fields.

## Button Configuration

### Pull Data Button Setup
1. Go to "Set Date" table
2. Add a "Button" field called "Pull Data Button"
3. Configure the button to:
   - **Button Text**: "Pull All Data"
   - **Action**: Run a script
   - **Script**: Use the master-date-pull.js script

## Benefits of This Approach

✅ **Single Date Control**: One master date range controls all data
✅ **Consistent Reporting**: All campaigns show same time period
✅ **Easy Comparison**: Compare performance across campaigns for same period
✅ **Simplified UI**: One button updates entire dashboard
✅ **Better UX**: User sets date range once, gets all data

## Usage Workflow

1. User opens "Set Date" table
2. Sets Master Start Date and Master End Date
3. Clicks "Pull Data Button"
4. System pulls data for ALL campaigns/ad groups/keywords/ads for that date range
5. All tables get updated with new metrics for the same period
6. Status shows success/error and number of records updated
