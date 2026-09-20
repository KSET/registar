import { useState, useCallback } from 'react';
import { validateForm } from './validation';

export function useForm(initialValues, validators) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const validateField = useCallback(
    (name, value, allValues) => {
      const validator = validators[name];
      if (!validator) return null;
      return validator(value, allValues);
    },
    [validators]
  );

  const handleChange = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const handleBlur = useCallback(
    (name) => {
      setTouched((prev) => ({ ...prev, [name]: true }));
      setValues((current) => {
        const err = validateField(name, current[name], current);
        setErrors((prev) => {
          const next = { ...prev };
          if (err) next[name] = err;
          else delete next[name];
          return next;
        });
        return current;
      });
    },
    [validateField]
  );

  const validateAll = useCallback(
    (fields) => {
      const allErrors = validateForm(values, validators, fields);
      setErrors(allErrors);
      const allTouched = {};
      for (const key of fields || Object.keys(validators)) {
        allTouched[key] = true;
      }
      setTouched((prev) => ({ ...prev, ...allTouched }));
      return Object.keys(allErrors).length === 0;
    },
    [values, validators]
  );

  const showError = (name) => (touched[name] ? errors[name] : null);

  return {
    values,
    setValues,
    errors,
    touched,
    handleChange,
    handleBlur,
    validateAll,
    showError,
  };
}
