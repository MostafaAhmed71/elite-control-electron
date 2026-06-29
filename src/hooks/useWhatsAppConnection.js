import { useState, useEffect, useCallback } from 'react';
import { getWhatsAppApiBase } from '../utils/dataService';

export function useWhatsAppConnection() {
    const [apiBase, setApiBase] = useState('');
    const [status, setStatus] = useState({
        status: 'loading',
        qr: '',
        pairingCode: '',
        connected: false,
    });
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isPairing, setIsPairing] = useState(false);
    const [logoutError, setLogoutError] = useState('');

    useEffect(() => {
        getWhatsAppApiBase().then(setApiBase);
    }, []);

    const checkStatus = useCallback(async () => {
        if (!apiBase) return;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            const res = await fetch(`${apiBase}/qr-json`, { signal: controller.signal });
            clearTimeout(timeoutId);
            const data = await res.json();
            setStatus(data);
            setLastUpdated(new Date());
        } catch {
            clearTimeout(timeoutId);
            setStatus((prev) =>
                prev.status === 'connecting'
                    ? prev
                    : { status: 'server_down', qr: '', pairingCode: '', connected: false }
            );
        }
    }, [apiBase]);

    useEffect(() => {
        if (!apiBase) return;
        checkStatus();
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }, [apiBase, checkStatus]);

    const disconnectWhatsApp = async (endpoint = '/logout') => {
        if (!apiBase) return false;
        setLogoutError('');
        setIsDisconnecting(true);
        setStatus({ status: 'connecting', qr: '', pairingCode: '', connected: false });
        try {
            const res = await fetch(`${apiBase}${endpoint}`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'فشل تسجيل الخروج');
            setPhoneNumber('');
            setTimeout(checkStatus, 1500);
            setTimeout(checkStatus, 4000);
            return true;
        } catch (err) {
            setLogoutError(err.message || 'تعذّر تسجيل الخروج');
            checkStatus();
            return false;
        } finally {
            setIsDisconnecting(false);
        }
    };

    const handleLogout = async () => {
        if (!apiBase) return;
        const ok = window.confirm(
            'تسجيل الخروج من واتساب الحالي؟\n\nسيتم مسح الجلسة المحفوظة. يمكنك بعدها مسح QR أو ربط رقم جوال آخر.'
        );
        if (!ok) return;
        await disconnectWhatsApp('/logout');
    };

    const handleReset = async () => {
        if (!apiBase) return;
        if (!window.confirm('إعادة تعيين الاتصال ومسح الجلسة الحالية؟')) return;
        await disconnectWhatsApp('/reset');
    };

    const handlePairPhone = async (e) => {
        e.preventDefault();
        if (!apiBase || !phoneNumber || phoneNumber.length < 9) return;
        setIsPairing(true);
        try {
            const res = await fetch(`${apiBase}/pair-phone`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: phoneNumber }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setTimeout(checkStatus, 3000);
        } catch (err) {
            console.error(err);
        } finally {
            setIsPairing(false);
        }
    };

    return {
        apiBase,
        status,
        lastUpdated,
        isDisconnecting,
        /** @deprecated استخدم isDisconnecting */
        isResetting: isDisconnecting,
        logoutError,
        phoneNumber,
        setPhoneNumber,
        isPairing,
        checkStatus,
        handleLogout,
        handleReset,
        handlePairPhone,
    };
}
