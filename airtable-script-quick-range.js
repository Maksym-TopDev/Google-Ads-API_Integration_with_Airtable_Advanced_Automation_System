// Config
const TABLE_NAME = 'Set Date';
const QUICK_RANGE_FIELD = 'Quick Range';           // Single select: Last 7 Days, Last 30 Days, Last 90 Days
const START_FIELD = 'Master Start Date';           // Date field
const END_FIELD = 'Master End Date';               // Date field

// Compute start/end for "through yesterday"
function getStartEndForQuickRange(quickRangeName) {
  if (!quickRangeName) return { start: null, end: null };

  // End is "yesterday" at 00:00:00 local time
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(todayLocal);
  
  console.log("start", end);
  end.setDate(end.getDate() - 1);

  let days;
  switch (quickRangeName) {
    case 'Last 7 Days':
      days = 7;
      break;
    case 'Last 30 Days':
      days = 30;
      break;
    case 'Last 90 Days':
      days = 90;
      break;
    default:
      return { start: null, end: null };
  }

  // Include end day, so subtract (days - 1)
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));

  return { start, end };
}

// Batch updater (Airtable limit: 50 updates per call)
async function updateInBatches(table, updates) {
  const size = 50;
  for (let i = 0; i < updates.length; i += size) {
    const chunk = updates.slice(i, i + size);
    await table.updateRecordsAsync(chunk);
  }
}

const table = base.getTable(TABLE_NAME);
const query = await table.selectRecordsAsync({
  fields: [QUICK_RANGE_FIELD, START_FIELD, END_FIELD]
});

const updates = [];
for (const record of query.records) {
  // Get single select name safely
  const quickRangeName = record.getCellValue(QUICK_RANGE_FIELD)?.name || '';
  if (!quickRangeName) continue;

  // Only handle the three options
  if (!['Last 7 Days', 'Last 30 Days', 'Last 90 Days'].includes(quickRangeName)) continue;

  const { start, end } = getStartEndForQuickRange(quickRangeName);
  if (!start || !end) continue;

  const currentStart = record.getCellValue(START_FIELD);
  const currentEnd = record.getCellValue(END_FIELD);

  // Avoid unnecessary writes (compare yyyy-mm-dd)
  const toYmd = d => {
    if (!d) return '';
    // Handle Date objects
    if (d instanceof Date) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    // Handle string dates (ISO format)
    if (typeof d === 'string') {
      const date = new Date(d);
      if (!isNaN(date.getTime())) {
        return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      }
    }
    return '';
  };
  const sameStart = toYmd(currentStart) === toYmd(start);
  const sameEnd = toYmd(currentEnd) === toYmd(end);

  if (!sameStart || !sameEnd) {
    updates.push({
      id: record.id,
      fields: {
        [START_FIELD]: start,
        [END_FIELD]: end
      }
    });
  }
}

if (updates.length > 0) {
  await updateInBatches(table, updates);
  console.log(`Updated ${updates.length} record(s).`);
} else {
  console.log('No updates needed.');
}
