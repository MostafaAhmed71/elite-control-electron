/**
 * يحوّل ملفات supabase/old/*_rows.sql لتستورد id + data فقط (بدون portal_*).
 * التشغيل: node student-portal-standalone/supabase/scripts/fix-old-sql-import.cjs
 */
const fs = require('fs');
const path = require('path');

const oldDir = path.join(__dirname, '..', 'old');
const outDir = path.join(oldDir, 'fixed');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function fixStudentsSql(content) {
  let sql = content.replace(
    /INSERT INTO "public"\."students" \([^)]+\)/i,
    'INSERT INTO public.students (id, data)'
  );
  // بعد نهاية jsonb: }, 'portal_national_norm', portal_seat_norm)
  sql = sql.replace(
    /(\ '{"id":(?:\\.|[^'\\])*}'), '[^']*', (?:null|'[^']*')\)/g,
    '$1)'
  );
  sql = appendUpsert(sql, 'students', ['id'], 'data = EXCLUDED.data');
  return sql;
}

function fixGenericIdData(content, table) {
  let sql = content.replace(
    new RegExp(`INSERT INTO "public"\\.\"${table}\" \\([^)]+\\)`, 'i'),
    `INSERT INTO public.${table} (id, data)`
  );
  sql = appendUpsert(sql, table, ['id'], 'data = EXCLUDED.data');
  return sql;
}

function fixRetakeSql(content) {
  let sql = content.replace(
    /INSERT INTO "public"\."retake_requests"/i,
    'INSERT INTO public.retake_requests'
  );
  sql = appendUpsert(sql, 'retake_requests', ['id'], 'data = EXCLUDED.data, created_at = EXCLUDED.created_at');
  return sql;
}

/** يضيف ON CONFLICT قبل ; النهائي إن لم يكن موجوداً */
function appendUpsert(sql, table, conflictCols, updateSet) {
  const trimmed = sql.trimEnd();
  if (/ON CONFLICT/i.test(trimmed)) return trimmed + '\n';
  const conflict = conflictCols.join(', ');
  if (trimmed.endsWith(';')) {
    return `${trimmed.slice(0, -1)}\nON CONFLICT (${conflict}) DO UPDATE SET ${updateSet};\n`;
  }
  return `${trimmed}\nON CONFLICT (${conflict}) DO UPDATE SET ${updateSet};\n`;
}

const files = fs.readdirSync(oldDir).filter((f) => f.endsWith('_rows.sql'));

for (const file of files) {
  const raw = fs.readFileSync(path.join(oldDir, file), 'utf8');
  let fixed = raw;
  if (file.startsWith('students')) {
    fixed = fixStudentsSql(raw);
  } else if (file.startsWith('settings')) {
    fixed = fixGenericIdData(raw, 'settings');
  } else if (file.startsWith('retake')) {
    fixed = fixRetakeSql(raw);
  }
  const outName = file.replace('_rows.sql', '_import.sql');
  fs.writeFileSync(path.join(outDir, outName), fixed, 'utf8');
  console.log('Wrote', outName);
}

console.log('\nDone. Run in Supabase SQL Editor (after full_schema + import_1_drop if needed):');
console.log('  1) settings_import.sql');
console.log('  2) students_import.sql');
console.log('  3) retake_requests_import.sql');
console.log('  4) import_3_restore_generated_columns.sql');
