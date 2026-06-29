import React, { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Link } from 'react-router-dom';
import { isPathBasedRouting } from './utils/publicRoutes';

function AppRouter({ children }) {
  const Router = isPathBasedRouting() ? BrowserRouter : HashRouter;
  return <Router>{children}</Router>;
}
import Sidebar from './components/Sidebar';
import SystemSelector from './components/SystemSelector';
import { ToastProvider, useToast } from './components/Toast';
import { useIsLgUp } from './hooks/useMediaQuery';

import { getStudents, getCommittees, getObservers, clearAllData, getAppSettings, subscribeToConnection } from './utils/dataService';
import { Trash2, AlertTriangle, Users, UsersRound, UserCheck, ScanLine, Send, WifiOff, Wifi, Menu, PanelRightClose } from 'lucide-react';

const StudentList = lazy(() => import('./pages/StudentList'));
const Committees = lazy(() => import('./pages/Committees'));
const SeatingCards = lazy(() => import('./pages/SeatingCards'));
const PrintSheets = lazy(() => import('./pages/PrintSheets'));
const PrintSheetsPreviewStudio = lazy(() => import('./pages/PrintSheets/PreviewStudio'));
const ExamPeriods = lazy(() => import('./pages/ExamPeriods'));
const Covers = lazy(() => import('./pages/Covers'));
const ObserverSheets = lazy(() => import('./pages/ObserverSheets'));
const Observers = lazy(() => import('./pages/Observers'));
const CommitteeObservers = lazy(() => import('./pages/CommitteeObservers'));
const CommitteeSeating = lazy(() => import('./pages/CommitteeSeating'));
const CommitteeRosterStudio = lazy(() => import('./pages/CommitteeRosterStudio'));
const PhotoRenamer = lazy(() => import('./pages/PhotoRenamer'));
const OMRScanner = lazy(() => import('./pages/OMRScanner'));
const OMRExams = lazy(() => import('./pages/OMRExams'));
const OMRResults = lazy(() => import('./pages/OMRResults'));
const ApprovedResults = lazy(() => import('./pages/ApprovedResults'));
const AggregatedGrades = lazy(() => import('./pages/AggregatedGrades'));
const GradeRecording = lazy(() => import('./pages/GradeRecording'));
const OMRDesigner = lazy(() => import('./pages/OMRDesigner'));
const StudentNotifier = lazy(() => import('./pages/StudentNotifier'));
const Settings = lazy(() => import('./pages/Settings'));
const MockExams = lazy(() => import('./pages/MockExams'));
const StudentPortal = lazy(() => import('./pages/StudentPortal'));
const TeacherSeatLookup = lazy(() => import('./pages/TeacherSeatLookup'));

function RouteLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-32 font-alexandria">
      <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4" />
      <p className="font-black text-slate-500 text-sm">جاري تحميل الصفحة...</p>
    </div>
  );
}

const Dashboard = ({ activeSystem }) => {
  const [stats, setStats] = React.useState({ students: 0, committees: 0, observers: 0 });
  const [appConfig, setAppConfig] = React.useState(null);
  const [loadError, setLoadError] = React.useState(false);
  const toast = useToast();

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const [s, c, o, config] = await Promise.all([getStudents(), getCommittees(), getObservers(), getAppSettings()]);
        setStats({ students: s.length, committees: c.length, observers: o.length });
        setAppConfig(config);
        setLoadError(false);
      } catch (err) {
        setLoadError(true);
        toast.error('تعذّر الاتصال بقاعدة البيانات. تحقق من اتصالك بالإنترنت.', 'خطأ في التحميل');
        console.error('Dashboard load error:', err);
      }
    };
    fetchData();
  }, [activeSystem]);

  const handleClear = () => clearAllData();

  const isGrading = activeSystem === 'grading';

  return (
    <div className="p-0 sm:p-0 space-y-6 sm:space-y-8 animate-fade-in text-slate-800 max-w-full">
      {/* Welcome Banner */}
      <div className="luxury-card p-5 sm:p-8 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 sm:gap-6 bg-gradient-to-br from-white to-slate-50 border-none">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 font-header leading-tight">
             مرحباً بك في <span className="gold-accent underline decoration-gold/20">نخبة الشمال</span>
          </h1>
          <p className="text-slate-500 text-sm mt-3 font-medium tracking-wide max-w-lg">
            {isGrading 
              ? "نظام الرصد الذكي والتصحيح الآلي للطلاب. يمكنك مراقبة الأداء وتصدير النتائج بكل سهولة." 
              : (appConfig?.platformName || "نظام الكنترول المتكامل لإدارة اللجان وأرقام الجلوس.")}
          </p>
        </div>
        <button
          onClick={handleClear}
          className="flex items-center justify-center gap-3 px-5 sm:px-8 py-3.5 sm:py-4 bg-red-50 text-red-600 border border-red-100 rounded-2xl hover:bg-red-600 hover:text-white transition-all text-sm font-bold shadow-sm active:scale-95 group w-full md:w-auto shrink-0"
        >
          <Trash2 size={20} className="group-hover:rotate-12 transition-transform" />
          <span>مسح السجلات</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
        {/* Card 1: Students */}
        <div className="luxury-card p-6 group relative overflow-hidden bg-white border-l-4 border-l-indigo-500">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-indigo-50 rounded-full opacity-40 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <h3 className="text-slate-400 text-[10px] mb-2 uppercase tracking-[0.2em] font-black font-header">إجمالي الطلاب</h3>
              <p className="text-4xl font-black text-slate-900 tracking-tighter">{stats.students}</p>
            </div>
            <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl shadow-sm">
                <Users size={28} />
            </div>
          </div>
          <div className="mt-8 flex items-center gap-2">
             <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
             <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">متصلون الآن بقاعدة البيانات</span>
          </div>
        </div>
        
        {/* Card 2: Committees/Exams */}
        <div className="luxury-card p-6 group relative overflow-hidden bg-white border-l-4 border-l-amber-500">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-amber-50 rounded-full opacity-40 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <h3 className="text-slate-400 text-[10px] mb-2 uppercase tracking-[0.2em] font-black font-header">
                {isGrading ? 'اختبارات OMR' : 'لجان الاختبار'}
              </h3>
              <p className="text-4xl font-black text-slate-900 tracking-tighter">
                {isGrading ? '-' : stats.committees}
              </p>
            </div>
            <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl shadow-sm">
                {isGrading ? <ScanLine size={28} /> : <UsersRound size={28} />}
            </div>
          </div>
          <div className="mt-8">
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-wider">
               {isGrading ? 'نظام التصحيح الآلي' : 'جاهز للطباعة والارشفة'}
            </span>
          </div>
        </div>

        {/* Card 3: Notifier / Observers */}
        <Link
          to="/notifier"
          className="luxury-card p-6 group relative overflow-hidden bg-white border-l-4 border-l-emerald-500 block hover:shadow-lg transition-shadow"
        >
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-emerald-50 rounded-full opacity-40 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <h3 className="text-slate-400 text-[10px] mb-2 uppercase tracking-[0.2em] font-black font-header">
                مركز الإشعارات
              </h3>
              <p className="text-2xl font-black text-slate-900 tracking-tight">واتساب</p>
            </div>
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl shadow-sm">
                <Send size={28} />
            </div>
          </div>
          <div className="mt-8">
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-wider">
               {isGrading ? 'بطاقات الجلوس والنتائج' : 'بطاقات الجلوس وتوزيع اللجان'}
            </span>
          </div>
        </Link>
      </div>

      {loadError && (
        <div className="luxury-card p-6 flex items-center gap-5 bg-rose-50 border border-rose-100 border-none">
          <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 shrink-0">
            <WifiOff size={24} />
          </div>
          <div>
            <p className="font-black text-rose-800 font-header">تعذّر الاتصال بقاعدة البيانات</p>
            <p className="text-rose-600 text-sm font-bold mt-1">تأكد من اتصالك بالإنترنت وأن خدمة Supabase تعمل بشكل صحيح.</p>
          </div>
        </div>
      )}

      {stats.students === 0 && !loadError && (
        <div className="luxury-card p-12 flex flex-col md:flex-row gap-10 items-center animate-slide-up bg-white border-none">
          <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center flex-shrink-0 shadow-xl shadow-indigo-100/50 text-indigo-600">
            <AlertTriangle size={48} />
          </div>
          <div className="text-center md:text-right">
            <h4 className="font-header font-black text-slate-900 text-3xl mb-3 tracking-tight">النظام جاهز للبدء...</h4>
            <p className="text-slate-500 text-lg font-medium leading-relaxed max-w-2xl">
              لم نجد أي بيانات مسجلة حالياً. يرجى البدء بعملية <span className="text-indigo-600 font-bold underline decoration-indigo-200 underline-offset-4">استيراد الطلاب</span> لتفعيل كافة أدوات {isGrading ? 'الرصد والتصحيح الآلي' : 'توزيع اللجان والتقارير'}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const Header = ({ sidebarOpen, onMenuToggle }) => {
  const [config, setConfig] = React.useState(null);
  const [connected, setConnected] = React.useState(true);

  React.useEffect(() => {
    getAppSettings().then(setConfig).catch(() => setConnected(false));
    // Subscribe to connection state changes from dataService
    const unsub = subscribeToConnection(setConnected);
    return unsub;
  }, []);

  return (
    <header className="h-14 sm:h-20 px-3 sm:px-6 lg:px-10 flex items-center justify-between gap-2 sticky top-0 z-40 bg-white/80 border-b border-gray-50 backdrop-blur-xl shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors shrink-0"
            aria-label={sidebarOpen ? 'إخفاء القائمة' : 'إظهار القائمة'}
          >
            {sidebarOpen ? <PanelRightClose size={20} /> : <Menu size={20} />}
          </button>
        )}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
           <div className="w-2 h-2 rounded-full bg-gold"></div>
           <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
        </div>
        <h1 className="text-sm sm:text-lg lg:text-xl font-black text-slate-800 tracking-tight font-header truncate">
           <span className="sm:hidden">نخبة الشمال</span>
           <span className="hidden sm:inline">منصة <span className="gold-accent">نخبة الشمال</span> الذكية</span>
        </h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 lg:gap-8 shrink-0">
        {/* Connection indicator */}
        <div className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black transition-all ${
          connected
            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
            : 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse'
        }`}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="hidden sm:inline">{connected ? 'Supabase متصل' : 'انقطع الاتصال'}</span>
        </div>

        <div className="hidden lg:flex flex-col items-end">
          <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] mb-1">مدير المدرسة</span>
          <span className="text-sm font-bold text-slate-700">{config?.managerName || 'الأستاذ محمد نصر الدين'}</span>
        </div>
        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 shadow-sm flex items-center justify-center text-sm sm:text-lg font-black text-indigo-600 transform hover:scale-105 transition-all cursor-pointer ring-2 sm:ring-4 ring-slate-50">
          {config?.managerName ? config.managerName.charAt(0) : 'م'}
        </div>
      </div>
    </header>
  );
};



const AdminLayout = ({ activeSystem, handleSystemSelect, setActiveSystem }) => {
  const isLgUp = useIsLgUp();
  const [sidebarOpen, setSidebarOpen] = React.useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );

  React.useEffect(() => {
    if (!isLgUp) setSidebarOpen(false);
  }, [isLgUp]);

  React.useEffect(() => {
    if (sidebarOpen && !isLgUp) {
      document.body.classList.add('sidebar-drawer-open');
      return () => document.body.classList.remove('sidebar-drawer-open');
    }
    document.body.classList.remove('sidebar-drawer-open');
  }, [sidebarOpen, isLgUp]);

  const closeSidebar = () => {
    if (!isLgUp) setSidebarOpen(false);
  };

  if (!activeSystem) {
    return <SystemSelector onSelect={handleSystemSelect} />;
  }

  return (
    <div className="min-h-screen flex overflow-x-hidden" dir="rtl">
      <Sidebar 
        activeSystem={activeSystem} 
        onSwitchSystem={() => setActiveSystem(null)}
        open={sidebarOpen}
        isOverlay={!isLgUp}
        onToggle={() => setSidebarOpen((v) => !v)}
        onRequestClose={closeSidebar}
      />
      <main
        className={`flex-1 min-h-screen min-w-0 relative transition-[margin] duration-300 ease-in-out ${
          sidebarOpen && isLgUp ? 'lg:mr-64' : ''
        }`}
      >
        <Header
          sidebarOpen={sidebarOpen}
          onMenuToggle={() => setSidebarOpen((v) => !v)}
        />

        <div className="p-3 sm:p-5 lg:p-8 pb-20 sm:pb-24 max-w-[100vw]">
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Dashboard activeSystem={activeSystem} />} />
              {/* Grading System Routes */}
              {activeSystem === 'grading' ? (
                <>
                  <Route path="/students" element={<StudentList />} />
                  <Route path="/omr-scanner/:examId?" element={<OMRScanner />} />
                  <Route path="/omr-exams" element={<OMRExams />} />
                  <Route path="/omr-results" element={<OMRResults />} />
                  <Route path="/approved-results" element={<ApprovedResults />} />
                  <Route path="/aggregated-grades" element={<AggregatedGrades />} />
                  <Route path="/mock-exams" element={<MockExams />} />
                  <Route path="/grade-recording" element={<GradeRecording />} />
                  <Route path="/omr-designer" element={<OMRDesigner />} />
                  <Route path="/photo-renamer" element={<PhotoRenamer />} />
                </>
              ) : (
                <>
                  {/* Control System Routes */}
                  <Route path="/students" element={<StudentList />} />
                  <Route path="/seating-cards" element={<SeatingCards />} />
                  <Route path="/committees" element={<Committees />} />
                  <Route path="/exam-periods" element={<ExamPeriods />} />
                  <Route path="/print-sheets" element={<PrintSheets />} />
                  <Route path="/print-sheets/preview" element={<PrintSheetsPreviewStudio />} />
                  <Route path="/covers" element={<Covers />} />
                  <Route path="/observers" element={<Observers />} />
                  <Route path="/committee-observers" element={<CommitteeObservers />} />
                  <Route path="/observer-sheets" element={<ObserverSheets />} />
                  <Route path="/committee-seating" element={<CommitteeSeating />} />
                  <Route path="/committee-roster-studio" element={<CommitteeRosterStudio />} />
                </>
              )}
              <Route path="/notifier" element={<StudentNotifier activeSystem={activeSystem} />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
};

function App() {
  const [activeSystem, setActiveSystem] = React.useState(localStorage.getItem('activeSystem'));

  const handleSystemSelect = (system) => {
    localStorage.setItem('activeSystem', system);
    setActiveSystem(system);
  };

  return (
    <ToastProvider>
      <AppRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/portal/*" element={<StudentPortal />} />
            <Route path="/teacher-lookup" element={<TeacherSeatLookup />} />
            <Route path="/*" element={
              <AdminLayout
                activeSystem={activeSystem}
                handleSystemSelect={handleSystemSelect}
                setActiveSystem={setActiveSystem}
              />
            } />
          </Routes>
        </Suspense>
      </AppRouter>
    </ToastProvider>
  );
}

export default App;
