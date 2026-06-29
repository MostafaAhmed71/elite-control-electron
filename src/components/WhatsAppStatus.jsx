import React from 'react';
import {
    CheckCircle,
    QrCode,
    Loader2,
    RefreshCw,
    RotateCcw,
    LogOut,
    AlertTriangle,
    Smartphone,
    Link2,
    Copy,
    Phone,
} from 'lucide-react';
import { useWhatsAppConnection } from '../hooks/useWhatsAppConnection';

/** شارة صغيرة لرأس الصفحة */
export function WhatsAppBadge({ wa }) {
    const { status, checkStatus, lastUpdated, handleLogout, isDisconnecting } = wa;

    if (status.connected) {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <CheckCircle size={16} />
                    <span className="text-xs font-black">واتساب متصل</span>
                </div>
                <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isDisconnecting}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-black hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 transition-colors disabled:opacity-50"
                    title="تسجيل الخروج لربط رقم آخر"
                >
                    {isDisconnecting ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <LogOut size={14} />
                    )}
                    تسجيل خروج
                </button>
            </div>
        );
    }

    if (status.status === 'server_down') {
        return (
            <div className="flex items-center gap-2">
                <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-black">
                    <AlertTriangle size={14} />
                    الخادم متوقف
                </span>
                <button
                    type="button"
                    onClick={checkStatus}
                    className="p-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                    title="إعادة المحاولة"
                >
                    <RefreshCw size={14} />
                </button>
            </div>
        );
    }

    if (status.status === 'connecting' || status.status === 'loading') {
        return (
            <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black">
                <Loader2 size={14} className="animate-spin" />
                جاري الاتصال...
            </span>
        );
    }

    return (
        <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs font-black">
            <QrCode size={14} />
            يلزم ربط واتساب
            <span className="text-[10px] font-bold text-amber-600/70">
                {lastUpdated.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
            </span>
        </span>
    );
}

/** لوحة الربط — تظهر فقط عند عدم الاتصال */
export function WhatsAppSetupPanel({ wa }) {
    const {
        status,
        phoneNumber,
        setPhoneNumber,
        isPairing,
        isDisconnecting,
        isResetting,
        handleLogout,
        handleReset,
        handlePairPhone,
        checkStatus,
        logoutError,
    } = wa;

    const disconnecting = isDisconnecting || isResetting;

    if (status.connected) {
        return (
            <div className="luxury-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/50 border-emerald-100">
                <p className="text-sm font-bold text-emerald-800">
                    الحساب مرتبط — لربط <span className="font-black">رقم واتساب آخر</span> سجّل الخروج ثم امسح QR أو أدخل الرقم الجديد.
                </p>
                <button
                    type="button"
                    onClick={handleLogout}
                    disabled={disconnecting}
                    className="shrink-0 px-5 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black hover:bg-rose-700 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {disconnecting ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                    تسجيل خروج / تبديل الرقم
                </button>
            </div>
        );
    }

    if (status.status === 'server_down') {
        return (
            <div className="luxury-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-rose-50/80 border-rose-100">
                <div className="flex items-center gap-3 text-rose-700">
                    <AlertTriangle size={22} />
                    <div>
                        <p className="font-black text-sm">خادم واتساب غير شغّال</p>
                        <p className="text-xs font-bold text-rose-600/80 mt-0.5">
                            من مجلد wppconnect-master شغّل: npm start
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={checkStatus}
                    className="px-5 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black hover:bg-rose-700 flex items-center gap-2"
                >
                    <RefreshCw size={14} />
                    إعادة المحاولة
                </button>
            </div>
        );
    }

    if (status.status === 'connecting' || (status.status === 'loading' && !status.qr)) {
        return (
            <div className="luxury-card p-5 flex items-center gap-4 text-slate-600">
                <Loader2 size={24} className="animate-spin text-indigo-500" />
                <p className="font-black text-sm">جاري تشغيل واتساب...</p>
            </div>
        );
    }

    if (status.status === 'qr') {
        return (
            <div className="luxury-card p-6 md:p-8 border-slate-100">
                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    <div className="shrink-0 mx-auto lg:mx-0">
                        {status.pairingCode ? (
                            <div className="text-center p-6 bg-amber-50 rounded-2xl border border-amber-100 min-w-[200px]">
                                <p className="text-[10px] font-black text-amber-700 mb-3">كود الربط</p>
                                <p className="text-4xl font-black text-amber-600 tracking-widest font-header">
                                    {status.pairingCode}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(status.pairingCode)}
                                    className="mt-4 text-[10px] font-black text-amber-700 flex items-center gap-1 mx-auto hover:text-amber-900"
                                >
                                    <Copy size={12} />
                                    نسخ
                                </button>
                            </div>
                        ) : status.qr ? (
                            <div className="p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                <img src={status.qr} alt="QR" className="w-44 h-44" />
                            </div>
                        ) : (
                            <div className="w-44 h-44 flex items-center justify-center bg-slate-50 rounded-2xl">
                                <Loader2 size={32} className="animate-spin text-indigo-400" />
                            </div>
                        )}
                    </div>

                    <div className="flex-1 space-y-5 min-w-0">
                        <div>
                            <h3 className="text-lg font-black text-slate-900 font-header">
                                {status.pairingCode ? 'أدخل الكود في واتساب' : 'امسح رمز QR من جوالك'}
                            </h3>
                            <p className="text-sm text-slate-500 font-bold mt-1">
                                واتساب → الأجهزة المرتبطة → ربط جهاز
                            </p>
                        </div>

                        {!status.pairingCode && (
                            <>
                                <ul className="space-y-2 text-sm font-bold text-slate-600">
                                    <li className="flex items-center gap-2">
                                        <Smartphone size={14} className="text-indigo-500" />
                                        افتح واتساب على الهاتف
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <Link2 size={14} className="text-indigo-500" />
                                        الأجهزة المرتبطة ← ربط جهاز
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <QrCode size={14} className="text-indigo-500" />
                                        امسح الرمز أو استخدم الرقم أدناه
                                    </li>
                                </ul>

                                <form onSubmit={handlePairPhone} className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
                                    <div className="relative flex-1">
                                        <Phone
                                            size={14}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                                        />
                                        <input
                                            type="text"
                                            placeholder="05xxxxxxxx"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            className="w-full pr-10 pl-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isPairing || !phoneNumber}
                                        className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black disabled:opacity-40 flex items-center justify-center gap-2"
                                    >
                                        {isPairing ? <Loader2 size={14} className="animate-spin" /> : null}
                                        كود بالرقم
                                    </button>
                                </form>
                            </>
                        )}

                        <button
                            type="button"
                            onClick={handleReset}
                            disabled={disconnecting}
                            className="text-[10px] font-black text-slate-400 hover:text-rose-600 flex items-center gap-1"
                        >
                            {disconnecting ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                <RotateCcw size={12} />
                            )}
                            إعادة تعيين الاتصال
                        </button>
                        {logoutError ? (
                            <p className="text-xs font-bold text-rose-600">{logoutError}</p>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    return null;
}

/** النسخة الكاملة (للصفحات التي تحتاج العرض القديم) */
const WhatsAppStatus = () => {
    const wa = useWhatsAppConnection();
    return (
        <div className="w-full space-y-4 font-alexandria mb-8">
            <div className="flex justify-end">
                <WhatsAppBadge wa={wa} />
            </div>
            <WhatsAppSetupPanel wa={wa} />
        </div>
    );
};

export default WhatsAppStatus;
