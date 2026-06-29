import { useState, useEffect, useCallback } from 'react';
import {
  loadCommitteeRosterConfig,
  saveCommitteeRosterConfig,
  mergeCommitteeRosterConfig,
  resetCommitteeRosterConfig,
} from '../utils/committeeRosterPrint';

export function useCommitteeRosterConfig() {
  const [config, setConfig] = useState(() => loadCommitteeRosterConfig());

  useEffect(() => {
    saveCommitteeRosterConfig(config);
  }, [config]);

  const handleConfigChange = useCallback((section, prop, value, isChecked = null) => {
    if (section === 'maxRows') {
      setConfig((prev) => ({ ...prev, maxRows: parseInt(value, 10) || 1 }));
      return;
    }

    if (section === 'table') {
      const finalValue = isChecked !== null ? isChecked : parseFloat(value);
      setConfig((prev) => ({
        ...prev,
        table: { ...prev.table, [prop]: finalValue },
      }));
      return;
    }

    if (section === 'managerFooter') {
      if (prop === 'heightMm') {
        const h = isChecked !== null ? isChecked : parseFloat(value);
        setConfig((prev) => ({
          ...prev,
          managerFooter: { ...(prev.managerFooter || {}), heightMm: h },
        }));
        return;
      }
      const fieldKey = prop;
      const subProp = value;
      const finalValue =
        isChecked !== null
          ? typeof isChecked === 'number'
            ? isChecked
            : parseFloat(isChecked)
          : parseFloat(subProp);
      setConfig((prev) => ({
        ...prev,
        managerFooter: {
          ...(prev.managerFooter || {}),
          [fieldKey]: {
            ...(prev.managerFooter?.[fieldKey] || {}),
            [subProp]: finalValue,
          },
        },
      }));
      return;
    }

    if (prop === null && isChecked !== null) {
      setConfig((prev) => ({ ...prev, [section]: isChecked }));
      return;
    }

    if (prop === null) {
      setConfig((prev) => ({ ...prev, [section]: value }));
      return;
    }

    const finalValue = isChecked !== null ? isChecked : parseFloat(value);
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], [prop]: finalValue },
    }));
  }, []);

  const resetConfig = useCallback(() => {
    if (!window.confirm('إعادة ضبط القالب إلى الإعدادات الافتراضية؟')) return;
    resetCommitteeRosterConfig();
    setConfig(mergeCommitteeRosterConfig(null));
  }, []);

  return { config, setConfig, handleConfigChange, resetConfig };
}
