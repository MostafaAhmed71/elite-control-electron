import React, { useState, useEffect } from 'react';
import { getStudents, getAppSettings, getCommittees, getLocations } from '../../utils/dataService';
import { searchStudentsByName } from '../../utils/studentNameSearch';
import { resolveStudentCommitteeVenue } from '../../utils/committeeUtils';
import { Search, AlertCircle, Hash, UsersRound, GraduationCap, MapPin } from 'lucide-react';

const getSeat = (s) => s.seatNumber ?? s.seat_number ?? '—';
const getCommittee = (s) => s.committee || '—';

function StatRow({ icon: Icon, label, value, iconBg, iconColor, valueClass = '' }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 sm:flex-col sm:items-center sm:text-center sm:gap-2 sm:p-6">
      <div
        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
      >
        <Icon size={20} className="sm:hidden" />
        <Icon size={24} className="hidden sm:block" />
      </div>
      <div className="flex-1 min-w-0 sm:flex-none">
        <span className="block text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5 sm:mb-0">
          {label}
        </span>
        <span className={`block font-black leading-tight break-words ${valueClass}`}>{value}</span>
      </div>
    </div>
  );
}

export default function TeacherSeatLookup() {
  const [nameQuery, setNameQuery] = useState('');
  const [students, setStudents] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [allStudents, settings, allCommittees, allLocations] = await Promise.all([
          getStudents(),
          getAppSettings(),
          getCommittees(),
          getLocations(),
        ]);
        if (!cancelled) {
          setStudents(allStudents);
          setCommittees(allCommittees);
          setLocations(allLocations);
          setConfig(settings);
          setDataReady(true);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('تعذّر تحميل بيانات الطلاب. تحقق من الاتصال بالإنترنت.');
          setDataReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const q = nameQuery.trim();
    if (!q) return;

    setLoading(true);
    setError('');
    setResults(null);

    const parts = q.split(/\s+/).filter(Boolean);
    if (parts.length > 2) {
      setError('يرجى إدخال الاسم الأول فقط، أو الاسم الأول والثاني.');
      setLoading(false);
      return;
    }

    const matches = searchStudentsByName(students, q);
    if (matches.length === 0) {
      setError('لم يتم العثور على طالب بهذا الاسم. جرّب الاسم الأول أو الاسم الأول والثاني.');
    } else {
      setResults(
        matches.sort((a, b) =>
          (a.name || '').localeCompare(b.name || '', 'ar', { numeric: true })
        )
      );
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] bg-[#f8fafc] text-slate-900 font-sans overflow-x-hidden" dir="rtl">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 sm:py-0 sm:h-20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-4 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0 mt-1 sm:mt-0">
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-amber-500 rounded-full" />
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-indigo-500 rounded-full" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-black text-slate-800 tracking-tight leading-snug">
                <span className="sm:hidden">استعلام المعلمين</span>
                <span className="hidden sm:inline">
                  استعلام المعلمين —{' '}
                  <span className="text-amber-600">رقم الجلوس واللجنة ومقرها</span>
                </span>
              </h1>
              <p className="text-amber-600 text-xs font-bold sm:hidden">رقم الجلوس · اللجنة · المقر</p>
            </div>
          </div>
          <p className="text-slate-400 font-bold text-xs sm:text-sm truncate pr-7 sm:pr-0">
            {config?.schoolName || 'نظام الكنترول'}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full px-3 sm:px-4 py-5 sm:py-12 md:py-16 pb-[max(2rem,env(safe-area-inset-bottom,0px))]">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg sm:shadow-2xl p-5 sm:p-8 md:p-12 border border-slate-100 mb-6 sm:mb-10 text-center relative overflow-hidden">
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-amber-50 rounded-full blur-3xl opacity-60 pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-60 pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-2xl sm:text-3xl font-black mb-2 sm:mb-3">ابحث عن طالب</h2>
            <p className="text-slate-500 text-sm sm:text-base font-medium mb-5 sm:mb-8 leading-relaxed px-1">
              أدخل <strong className="text-slate-700">الاسم الأول</strong> أو{' '}
              <strong className="text-slate-700">الاسم الأول والثاني</strong> لمعرفة رقم الجلوس ورقم اللجنة ومقرها.
            </p>

            <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:gap-4">
              <div className="relative">
                <Search
                  className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  size={20}
                />
                <input
                  type="search"
                  enterKeyHint="search"
                  placeholder="مثال: محمد أو محمد أحمد"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl sm:rounded-2xl py-3.5 sm:py-4 pr-12 sm:pr-14 pl-4 text-base sm:text-xl font-bold focus:border-amber-500 focus:bg-white outline-none transition-all shadow-inner"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  disabled={!dataReady}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !nameQuery.trim() || !dataReady}
                className="w-full sm:w-auto sm:self-center bg-amber-500 hover:bg-amber-600 text-white px-8 sm:px-10 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black text-base sm:text-lg shadow-lg sm:shadow-xl shadow-amber-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 touch-manipulation"
              >
                {loading ? 'جاري البحث...' : 'بحث'}
              </button>
            </form>

            {error && (
              <div className="mt-4 sm:mt-6 flex items-start sm:items-center justify-start sm:justify-center gap-2 text-rose-600 bg-rose-50 px-4 sm:px-6 py-3.5 sm:py-4 rounded-xl border border-rose-100 font-bold text-sm sm:text-base text-right animate-fade-in">
                <AlertCircle size={18} className="shrink-0 mt-0.5 sm:mt-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {results && results.length > 0 && (
          <div className="space-y-3 sm:space-y-4 animate-fade-in">
            <p className="text-xs sm:text-sm font-bold text-slate-500 text-center mb-4 sm:mb-6 px-1">
              {results.length === 1
                ? 'تم العثور على طالب واحد'
                : `تم العثور على ${results.length} طلاب — اختر الطالب المناسب`}
            </p>

            {results.map((student) => {
              const venue = resolveStudentCommitteeVenue(student, committees, locations);
              return (
                <div
                  key={student.id || `${student.name}-${getSeat(student)}`}
                  className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-md sm:shadow-lg overflow-hidden"
                >
                  <div className="bg-gradient-to-l from-indigo-900 to-indigo-800 text-white px-4 sm:px-6 py-3.5 sm:py-4">
                    <h3 className="text-lg sm:text-xl font-black leading-snug break-words">{student.name}</h3>
                    {(student.grade || student.stage) && (
                      <p className="text-indigo-200 text-xs sm:text-sm font-bold mt-1 flex items-center gap-1.5">
                        <GraduationCap size={14} className="shrink-0" />
                        <span>{[student.stage, student.grade].filter(Boolean).join(' — ')}</span>
                      </p>
                    )}
                  </div>

                  <div className="divide-y divide-slate-100 sm:grid sm:grid-cols-3 sm:divide-y-0 sm:divide-x sm:divide-x-reverse">
                    <StatRow
                      icon={Hash}
                      label="رقم الجلوس"
                      value={getSeat(student)}
                      iconBg="bg-blue-50"
                      iconColor="text-blue-600"
                      valueClass="text-2xl sm:text-4xl text-blue-600 tabular-nums"
                    />
                    <StatRow
                      icon={UsersRound}
                      label="رقم اللجنة"
                      value={getCommittee(student)}
                      iconBg="bg-amber-50"
                      iconColor="text-amber-600"
                      valueClass="text-xl sm:text-3xl text-amber-700 tabular-nums"
                    />
                    <StatRow
                      icon={MapPin}
                      label="مقر اللجنة"
                      value={venue}
                      iconBg="bg-emerald-50"
                      iconColor="text-emerald-600"
                      valueClass="text-base sm:text-lg text-emerald-800"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
