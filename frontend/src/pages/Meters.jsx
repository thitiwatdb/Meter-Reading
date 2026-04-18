import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Image,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload
} from 'antd';
import { ReloadOutlined, SearchOutlined, UploadOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../axios';
import { fileToBase64, uploadBase64 } from '../utils/uploadBase64';

const formatUnit = (val) => {
  if (val === null || typeof val === 'undefined' || val === '') return '-';
  const num = Number(val);
  return Number.isFinite(num) ? num.toFixed(3) : '-';
};

const formatCurrencyValue = (val) => {
  if (val === null || typeof val === 'undefined' || val === '') return '-';
  const num = Number(val);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatUnitInput = (num) => {
  if (!Number.isFinite(num)) return '';
  const fixed = num.toFixed(3);
  return fixed.replace(/\.?0+$/, '') || '0';
};

const resolveImageUrl = (path) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
};

const initialFilters = { building_code: '', room_id: '', type: '', date_from: '', date_to: '' };

const fromMonthInputValue = (value) => {
  if (!value) return null;
  return `${value}-01`;
};

export default function Meters() {
  const [items, setItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [formBuilding, setFormBuilding] = useState('');
  const [form, setForm] = useState({ room_id: '', type: 'WATER', reading_date: '', billing_month: '', reading_value: '', value_unit: '' });
  const [rates, setRates] = useState({ WATER_RATE: 0, ELECTRIC_RATE: 0 });
  const [file, setFile] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState('');
  const [derivedInfo, setDerivedInfo] = useState({ price: null, previous: null, usage: null });
  const [deriving, setDeriving] = useState(false);
  const [deriveError, setDeriveError] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [detailItem, setDetailItem] = useState(null);
  const [detailReading, setDetailReading] = useState('');
  const [detailValue, setDetailValue] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '',
    room_id: '',
    type: 'WATER',
    reading_date: '',
    billing_month: '',
    reading_value: '',
    value_unit: '',
    image_path: ''
  });
  const [editBuilding, setEditBuilding] = useState('');
  const [editFile, setEditFile] = useState(null);
  const [editDerivedInfo, setEditDerivedInfo] = useState({ price: null, previous: null, usage: null });
  const [editDeriveError, setEditDeriveError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editOriginalImage, setEditOriginalImage] = useState('');

  const rateForType = (type) => {
    if (!type) return null;
    const key = type.toUpperCase() === 'ELECTRIC' ? 'ELECTRIC_RATE' : 'WATER_RATE';
    const value = rates[key];
    return Number.isFinite(value) ? Number(value) : null;
  };

  const load = async (sourceFilters = filters) => {
    setLoading(true);
    try {
      const params = {};
      if (sourceFilters.room_id) params.room_id = sourceFilters.room_id;
      if (sourceFilters.type) params.type = sourceFilters.type;
      if (sourceFilters.date_from) params.date_from = sourceFilters.date_from;
      if (sourceFilters.date_to) params.date_to = sourceFilters.date_to;
      const [meterRes, roomRes] = await Promise.all([
        api.get('/meters', { params }),
        api.get('/rooms')
      ]);
      setItems(meterRes.data || []);
      setRooms(roomRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const res = await api.get('/settings');
        const parse = (val) => {
          const num = Number(val);
          return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
        };
        setRates({
          WATER_RATE: parse(res.data?.WATER_RATE ?? null),
          ELECTRIC_RATE: parse(res.data?.ELECTRIC_RATE ?? null)
        });
      } catch (err) {
        setRates((prev) => ({
          WATER_RATE: typeof prev.WATER_RATE === 'number' ? prev.WATER_RATE : 0,
          ELECTRIC_RATE: typeof prev.ELECTRIC_RATE === 'number' ? prev.ELECTRIC_RATE : 0
        }));
      }
    };
    loadRates();
  }, []);

  useEffect(() => {
    const hasRoom = !!form.room_id;
    const hasDate = !!form.reading_date;
    const hasReadingInput = form.reading_value !== '';

    if (!hasRoom || !hasDate) {
      setDerivedInfo({ price: null, previous: null, usage: null });
      setDeriveError(hasReadingInput ? 'Select room and reading date to calculate usage automatically.' : '');
      setDeriving(false);
      return;
    }

    let numericReading = null;
    if (hasReadingInput) {
      numericReading = Number(form.reading_value);
      if (!Number.isFinite(numericReading)) {
        setDeriveError('Reading must be a valid number');
        setDerivedInfo({ price: null, previous: null, usage: null });
        setDeriving(false);
        return;
      }
    }

    const payload = {
      room_id: form.room_id,
      type: form.type,
      reading_date: form.reading_date
    };
    if (hasReadingInput) payload.reading_value = Number(numericReading.toFixed(3));
    if (form.billing_month) payload.billing_month = fromMonthInputValue(form.billing_month);

    let cancelled = false;
    setDeriving(true);
    setDeriveError('');

    const fetchDerived = async () => {
      try {
        const res = await api.post('/meters/derive', payload);
        if (cancelled) return;
        const data = res.data || {};
        const computedValue = typeof data.computedValue === 'number' ? Number(data.computedValue) : null;
        const price = typeof data.price === 'number' ? data.price : null;
        const previous = typeof data.previousReading === 'number' ? Number(data.previousReading) : null;

        setDerivedInfo({
          price: hasReadingInput ? price : null,
          previous,
          usage: computedValue
        });

        setForm((prev) => {
          const derivedMonth =
            data.billingMonth
              ? data.billingMonth.slice(0, 7)
              : prev.billing_month || (prev.reading_date ? prev.reading_date.slice(0, 7) : '');
          const next = { ...prev, billing_month: derivedMonth };
          if (hasReadingInput && computedValue !== null) {
            const formatted = formatUnitInput(computedValue);
            if (prev.value_unit !== formatted) {
              next.value_unit = formatted;
            }
          } else if (!hasReadingInput && prev.value_unit) {
            next.value_unit = '';
          }
          return next;
        });

      } catch (err) {
        if (cancelled) return;
        const message = err?.response?.data?.message || 'Unable to derive usage';
        setDeriveError(message);
        setDerivedInfo({ price: null, previous: null, usage: null });
      } finally {
        if (!cancelled) setDeriving(false);
      }
    };

    fetchDerived();

    return () => {
      cancelled = true;
    };
  }, [form.room_id, form.type, form.reading_date, form.billing_month, form.reading_value]);

  useEffect(() => {
    if (!editModalOpen) return;

    const hasRoom = !!editForm.room_id;
    const hasDate = !!editForm.reading_date;
    const hasReadingInput = editForm.reading_value !== '';

    if (!hasRoom || !hasDate) {
      setEditDerivedInfo({ price: null, previous: null, usage: null });
      setEditDeriveError(hasReadingInput ? 'Select room and reading date to calculate usage automatically.' : '');
      return;
    }

    let numericReading = null;
    if (hasReadingInput) {
      numericReading = Number(editForm.reading_value);
      if (!Number.isFinite(numericReading)) {
        setEditDeriveError('Reading must be a valid number');
        setEditDerivedInfo({ price: null, previous: null, usage: null });
        return;
      }
    }

    const payload = {
      room_id: editForm.room_id,
      type: editForm.type,
      reading_date: editForm.reading_date
    };
    if (hasReadingInput) {
      payload.reading_value = Number(numericReading.toFixed(3));
    }
    if (editForm.billing_month) {
      payload.billing_month = fromMonthInputValue(editForm.billing_month);
    }

    let cancelled = false;
    setEditDeriveError('');

    const fetchDerived = async () => {
      try {
        const res = await api.post('/meters/derive', payload);
        if (cancelled) return;
        const data = res.data || {};
        const computedValue = typeof data.computedValue === 'number' ? Number(data.computedValue) : null;
        const price = typeof data.price === 'number' ? data.price : null;
        const previous = typeof data.previousReading === 'number' ? Number(data.previousReading) : null;

        setEditDerivedInfo({
          price: hasReadingInput ? price : null,
          previous,
          usage: computedValue
        });

        setEditForm((prev) => {
          const derivedMonth =
            data.billingMonth
              ? data.billingMonth.slice(0, 7)
              : prev.billing_month || (prev.reading_date ? prev.reading_date.slice(0, 7) : '');
          const next = { ...prev, billing_month: derivedMonth };
          if (hasReadingInput && computedValue !== null) {
            const formattedValue = formatUnitInput(computedValue);
            if (prev.value_unit !== formattedValue) {
              next.value_unit = formattedValue;
            }
          } else if (!hasReadingInput && prev.value_unit) {
            next.value_unit = '';
          }
          return next;
        });

      } catch (err) {
        if (cancelled) return;
        const message = err?.response?.data?.message || 'Unable to derive usage';
        setEditDeriveError(message);
        setEditDerivedInfo({ price: null, previous: null, usage: null });
      }
    };

    fetchDerived();

    return () => {
      cancelled = true;
    };
  }, [editModalOpen, editForm.room_id, editForm.type, editForm.reading_date, editForm.billing_month, editForm.reading_value]);

  const applyFilters = async () => {
    await load(filters);
  };

  const resetFilters = async () => {
    const defaults = { ...initialFilters };
    setFilters(defaults);
    await load(defaults);
  };

  const create = async () => {
    if (!form.room_id) {
      alert('Please select a room before adding a reading.');
      return;
    }
    if (!form.reading_date) {
      alert('Please select the reading date.');
      return;
    }
    try {
      let image_path = null;
      if (file) {
        const b64 = await fileToBase64(file);
        const up = await uploadBase64(b64, file.name);
        image_path = up.path;
      }
      let aiNumeric = null;
      if (form.reading_value !== '') {
        const parsed = Number(form.reading_value);
        aiNumeric = Number.isFinite(parsed) ? parsed : null;
      }
      const payload = {
        room_id: form.room_id,
        type: form.type,
        reading_date: form.reading_date,
        billing_month: form.billing_month ? fromMonthInputValue(form.billing_month) : undefined,
        value_unit: form.value_unit !== '' ? Number(form.value_unit) : null,
        ai_value: aiNumeric,
        image_path
      };
      const res = await api.post('/meters', payload);
      setItems((prev) => [res.data, ...prev]);
      setForm({ room_id: '', type: 'WATER', reading_date: '', billing_month: '', reading_value: '', value_unit: '' });
      setFormBuilding('');
      setDerivedInfo({ price: null, previous: null, usage: null });
      setPredictError('');
      setDeriveError('');
      setPredicting(false);
      setDeriving(false);
      setFile(null);
    } catch (err) {
      const message = err?.response?.data?.message || 'Create meter reading failed';
      alert(message);
    }
  };

  const openDetail = (reading) => {
    setDetailItem(reading);
    setDetailReading(
      reading?.ai_value !== null && reading?.ai_value !== undefined
        ? formatUnitInput(Number(reading.ai_value))
        : ''
    );
    setDetailValue(
      reading?.value_unit !== null && reading?.value_unit !== undefined
        ? formatUnitInput(Number(reading.value_unit))
        : ''
    );
  };

  const closeDetail = () => {
    setDetailItem(null);
    setDetailReading('');
    setDetailValue('');
  };

  const handleAddFileChange = async (nextFile) => {
    setFile(nextFile);
    setPredictError('');
    if (!nextFile) {
      setPredicting(false);
      setDerivedInfo({ price: null, previous: null, usage: null });
      setDeriving(false);
      setDeriveError('');
      setForm((f) => ({ ...f, reading_value: '', value_unit: '' }));
      return;
    }
    try {
      setPredicting(true);
      const base64 = await fileToBase64(nextFile);
      const currentForm = { ...form };
      const res = await api.post('/meters/predict', {
        filename: nextFile.name,
        contentBase64: base64,
        room_id: currentForm.room_id || undefined,
        type: currentForm.type,
        reading_date: currentForm.reading_date || undefined,
        billing_month: currentForm.billing_month
          ? fromMonthInputValue(currentForm.billing_month)
          : undefined
      });
      const data = res.data || {};
      const detections = data.detections || {};
      let readingRaw = data.numeric_value ?? detections.numeric_value;
      if (
        readingRaw === null ||
        typeof readingRaw === 'undefined' ||
        (typeof readingRaw === 'string' && readingRaw.trim() === '')
      ) {
        const concatenated = detections.concatenated_labels;
        if (typeof concatenated === 'string' && concatenated.trim() !== '') {
          readingRaw = concatenated;
        }
      }

      const hasReading =
        readingRaw !== null &&
        typeof readingRaw !== 'undefined' &&
        String(readingRaw).trim() !== '';

      const derived = data.derived || null;
      const derivedUsage =
        derived && typeof derived.computedValue === 'number'
          ? Number(derived.computedValue)
          : null;
      const derivedPrevious =
        derived && typeof derived.previousReading === 'number'
          ? Number(derived.previousReading)
          : null;
      setDerivedInfo({
        price: derived && typeof derived.price === 'number' ? derived.price : null,
        previous: derivedPrevious,
        usage: derivedUsage
      });

      setDeriveError('');
      setDeriving(false);

      setForm((f) => {
        const derivedMonth =
          derived && derived.billingMonth
            ? derived.billingMonth.slice(0, 7)
            : f.billing_month || (f.reading_date ? f.reading_date.slice(0, 7) : '');
        const next = {
          ...f,
          reading_value: hasReading ? String(readingRaw) : '',
          billing_month: derivedMonth
        };
        if (derivedUsage !== null) {
          next.value_unit = formatUnitInput(derivedUsage);
        } else if (!hasReading) {
          next.value_unit = '';
        }
        return next;
      });

      if (!hasReading) {
        setPredictError('No readable digits detected from image.');
      } else if (!derived) {
        if (!currentForm.room_id || !currentForm.reading_date) {
          setPredictError('Select room and reading date to calculate usage automatically.');
        }
      }
    } catch (err) {
      console.error('predict reading failed', err);
      const message = err?.response?.data?.message || 'Prediction failed';
      setDerivedInfo({ price: null, previous: null, usage: null });
      setForm((f) => ({ ...f, reading_value: '', value_unit: '' }));
      setPredictError(message);
      setDeriveError(message);
      setDeriving(false);
    } finally {
      setPredicting(false);
    }
  };

  const openEdit = (reading) => {
    setEditForm({
      id: reading.id,
      room_id: reading.room_id,
      type: reading.type,
      reading_date: reading.reading_date ? reading.reading_date.slice(0, 10) : '',
      billing_month: reading.billing_month
        ? reading.billing_month.slice(0, 7)
        : reading.reading_date
          ? reading.reading_date.slice(0, 7)
          : '',
      reading_value:
        reading?.ai_value !== null && reading?.ai_value !== undefined
          ? formatUnitInput(Number(reading.ai_value))
          : '',
      value_unit:
        reading?.value_unit !== null && reading?.value_unit !== undefined
          ? formatUnitInput(Number(reading.value_unit))
          : '',
      image_path: reading.image_path || ''
    });
    setEditBuilding(reading.building_code || '');
    setEditFile(null);
    setEditDerivedInfo({ price: null, previous: null, usage: null });
    setEditDeriveError('');
    setEditOriginalImage(reading.image_path || '');
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    if (savingEdit) return;
    setEditModalOpen(false);
    setEditForm({
      id: '',
      room_id: '',
      type: 'WATER',
      reading_date: '',
      billing_month: '',
      reading_value: '',
      value_unit: '',
      image_path: ''
    });
    setEditBuilding('');
    setEditFile(null);
    setEditDerivedInfo({ price: null, previous: null, usage: null });
    setEditDeriveError('');
    setEditOriginalImage('');
  };

  const handleEditFileChange = (nextFile) => {
    setEditFile(nextFile);
  };

  const handleEditRemoveFile = () => {
    if (editFile) {
      setEditFile(null);
    } else {
      setEditForm((prev) => ({ ...prev, image_path: '' }));
    }
  };

  const submitEdit = async () => {
    if (!editForm.room_id) {
      alert('Please select a room before saving.');
      return;
    }
    if (!editForm.reading_date) {
      alert('Please select the reading date.');
      return;
    }
    setSavingEdit(true);
    try {
      let imagePathPayload;
      if (editFile) {
        const b64 = await fileToBase64(editFile);
        const up = await uploadBase64(b64, editFile.name);
        imagePathPayload = up.path;
      } else if (editOriginalImage && editForm.image_path === '') {
        imagePathPayload = null;
      }

      const payload = {
        room_id: editForm.room_id,
        type: editForm.type,
        reading_date: editForm.reading_date,
        ai_value: editForm.reading_value !== '' ? Number(editForm.reading_value) : null,
        value_unit: editForm.value_unit !== '' ? Number(editForm.value_unit) : null
      };

      if (typeof imagePathPayload !== 'undefined') {
        payload.image_path = imagePathPayload;
      }

      await api.patch(`/meters/${editForm.id}`, payload);
      await load(filters);
      closeEditModal();
    } catch (err) {
      const message = err?.response?.data?.message || 'Update meter reading failed';
      alert(message);
    } finally {
      setSavingEdit(false);
    }
  };

  const buildingOptions = useMemo(() => {
    const codes = new Set();
    const list = [];
    rooms.forEach((room) => {
      const code = room.building_code;
      if (code && !codes.has(code)) {
        codes.add(code);
        list.push(code);
      }
    });
    return list.sort((a, b) => a.localeCompare(b));
  }, [rooms]);

  const addRoomOptions = useMemo(() => {
    if (!formBuilding) return rooms;
    return rooms.filter((room) => room.building_code === formBuilding);
  }, [rooms, formBuilding]);

  const filterRoomOptions = useMemo(() => {
    if (!filters.building_code) return rooms;
    return rooms.filter((room) => room.building_code === filters.building_code);
  }, [rooms, filters.building_code]);

  const editRoomOptions = useMemo(() => {
    if (!editBuilding) return rooms;
    return rooms.filter((room) => room.building_code === editBuilding);
  }, [rooms, editBuilding]);

  const editUploadList = useMemo(() => {
    if (editFile) {
      return [
        {
          uid: 'edit-selected-file',
          name: editFile.name,
          status: 'done'
        }
      ];
    }
    if (editForm.image_path) {
      const filename = editForm.image_path.split('/').pop() || 'image';
      return [
        {
          uid: 'edit-existing-image',
          name: filename,
          status: 'done',
          url: resolveImageUrl(editForm.image_path)
        }
      ];
    }
    return [];
  }, [editFile, editForm.image_path]);

  const editActiveRate = useMemo(() => {
    const key = editForm.type === 'ELECTRIC' ? 'ELECTRIC_RATE' : 'WATER_RATE';
    const value = rates[key];
    return Number.isFinite(value) ? value : null;
  }, [editForm.type, rates]);

  const editDisplayPrice = useMemo(() => {
    if (editDerivedInfo.price !== null) {
      return formatCurrencyValue(editDerivedInfo.price);
    }
    if (editForm.value_unit === '') return '-';
    const units = Number(editForm.value_unit);
    if (!Number.isFinite(units) || editActiveRate === null) return '-';
    return (units * editActiveRate).toFixed(2);
  }, [editDerivedInfo.price, editForm.value_unit, editActiveRate]);

  const filteredItems = useMemo(() => {
    if (!filters.building_code) return items;
    return items.filter((item) => item.building_code === filters.building_code);
  }, [items, filters.building_code]);

  const uploadFileList = useMemo(
    () =>
      file
        ? [
            {
              uid: 'selected-file',
              name: file.name,
              status: 'done'
            }
          ]
        : [],
    [file]
  );

  const activeRate = useMemo(() => {
    const key = form.type === 'ELECTRIC' ? 'ELECTRIC_RATE' : 'WATER_RATE';
    const value = rates[key];
    return Number.isFinite(value) ? value : null;
  }, [form.type, rates]);

  const displayRate = useMemo(() => {
    if (activeRate === null) return '-';
    return activeRate.toFixed(2);
  }, [activeRate]);

  const displayPrice = useMemo(() => {
    if (derivedInfo.price !== null) {
      return formatCurrencyValue(derivedInfo.price);
    }
    if (form.value_unit === '') return '-';
    const units = Number(form.value_unit);
    if (!Number.isFinite(units) || activeRate === null) return '-';
    return (units * activeRate).toFixed(2);
  }, [derivedInfo.price, form.value_unit, activeRate]);

  const detailRateRaw =
    detailItem && detailItem.rate !== null && detailItem.rate !== undefined && detailItem.rate !== ''
      ? Number(detailItem.rate)
      : NaN;
  const detailRateCandidate =
    detailItem && Number.isFinite(detailRateRaw) ? detailRateRaw : detailItem ? rateForType(detailItem.type) : null;
  const detailRateValue =
    typeof detailRateCandidate === 'number' && Number.isFinite(detailRateCandidate) ? detailRateCandidate : null;
  const detailPricePreview = detailItem ? formatCurrencyValue(detailItem.price) : '-';
  const detailImageUrl = detailItem ? resolveImageUrl(detailItem.image_path) : '';
  const detailPrevious = detailItem?.previous_ai_value;
  const detailReadingDisplay = detailReading === '' ? '-' : detailReading;
  const detailValueDisplay = detailValue === '' ? '-' : detailValue;
  const detailUsageNumeric =
    detailValue !== '' && Number.isFinite(Number(detailValue)) ? Number(detailValue) : null;
  const detailPreviousNumeric =
    typeof detailPrevious === 'number' && Number.isFinite(detailPrevious) ? detailPrevious : null;
  const detailComputedReading =
    detailPreviousNumeric !== null && detailUsageNumeric !== null
      ? formatUnit(detailPreviousNumeric + detailUsageNumeric)
      : '-';
  const detailModalOpen = Boolean(detailItem);

  const tableColumns = [
    {
      title: 'Room / Type',
      key: 'room',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>
            {record.building_code ? `${record.building_code}-${record.room_no}` : record.room_no}
          </Typography.Text>
          <Tag color={record.type === 'WATER' ? 'blue' : 'gold'}>{record.type}</Tag>
        </Space>
      )
    },
    {
      title: 'Date',
      dataIndex: 'reading_date',
      key: 'date',
      render: (value) => (value ? value.slice(0, 10) : '-')
    },
    {
      title: 'Billing Month',
      dataIndex: 'billing_month',
      key: 'billing_month',
      render: (value) => (value ? value.slice(0, 7) : '-')
    },
    {
      title: 'Billing',
      key: 'billing',
      render: (_, record) => {
        const rawRate =
          record.rate !== null && record.rate !== undefined && record.rate !== ''
            ? Number(record.rate)
            : NaN;
        const fallbackRate = rateForType(record.type);
        const effectiveRate =
          typeof rawRate === 'number' && Number.isFinite(rawRate)
            ? rawRate
            : typeof fallbackRate === 'number' && Number.isFinite(fallbackRate)
              ? fallbackRate
              : null;

        return (
          <Space direction="vertical" size={2}>
            <Typography.Text>{formatCurrencyValue(record.price)}</Typography.Text>
            <Typography.Text type="secondary">Usage: {formatUnit(record.value_unit)}</Typography.Text>
            {typeof effectiveRate === 'number' && Number.isFinite(effectiveRate) && (
              <Typography.Text type="secondary">Rate: {effectiveRate.toFixed(2)}</Typography.Text>
            )}
          </Space>
        );
      }
    },
    {
      title: 'Image',
      key: 'image',
      render: (_, record) =>
        record.image_path ? (
          <Image
            width={96}
            height={96}
            src={resolveImageUrl(record.image_path)}
            style={{ objectFit: 'cover', borderRadius: 8 }}
            alt="Meter"
          />
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        )
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button type="link" onClick={() => openDetail(record)}>
            Detail
          </Button>
          <Button type="link" onClick={() => openEdit(record)}>
            Edit
          </Button>
        </Space>
      )
    }
  ];

  return (
    <>
      <Space
        direction="vertical"
        size="large"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "24px 16px",
          width: "100%",
          display: "block", // important
        }}
      >
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          Meter Readings
        </Typography.Title>

        <Card title="Add Meter Reading" styles={{ body: { paddingTop: 16 } }}>
          <Form layout="vertical" colon={false}>
            <Row gutter={[16, 8]}>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Building">
                  <Select
                    allowClear
                    placeholder="All buildings"
                    value={formBuilding || undefined}
                    onChange={(value) => {
                      const next = value || "";
                      setFormBuilding(next);
                      setForm((f) => ({ ...f, room_id: "" }));
                      setDerivedInfo({ price: null, previous: null, usage: null });
                      setDeriveError("");
                    }}
                    options={buildingOptions.map((code) => ({
                      value: code,
                      label: code,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Room">
                  <Select
                    allowClear
                    placeholder="Select room"
                    value={form.room_id || undefined}
                    onChange={(value) => {
                      const next = value || "";
                      setForm((f) => ({ ...f, room_id: next }));
                      setDerivedInfo({ price: null, previous: null, usage: null });
                      setDeriveError("");
                    }}
                    showSearch
                    optionFilterProp="label"
                    options={addRoomOptions.map((r) => ({
                      value: String(r.id),
                      label: r.building_code
                        ? `${r.building_code}-${r.room_no}`
                        : r.room_no,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Type">
                  <Select
                    value={form.type}
                    onChange={(value) => {
                      setForm((f) => ({ ...f, type: value }));
                      setDerivedInfo({ price: null, previous: null, usage: null });
                      setDeriveError("");
                    }}
                    options={[
                      { value: "WATER", label: "Water" },
                      { value: "ELECTRIC", label: "Electric" },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Rate (per unit)">
                  <Input
                    value={displayRate}
                    disabled
                    style={{ textAlign: "right" }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Reading Date">
                  <Input
                    type="date"
                    value={form.reading_date}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) => {
                        const nextMonth = value ? value.slice(0, 7) : '';
                        const existingMonthFromDate = prev.reading_date ? prev.reading_date.slice(0, 7) : '';
                        const shouldUpdateMonth =
                          !prev.billing_month || prev.billing_month === existingMonthFromDate;
                        return {
                          ...prev,
                          reading_date: value,
                          billing_month: shouldUpdateMonth ? nextMonth : prev.billing_month
                        };
                      });
                      setDerivedInfo({ price: null, previous: null, usage: null });
                      setDeriveError("");
                    }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Billing Month">
                  <Input
                    type="month"
                    value={form.billing_month}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) => ({ ...prev, billing_month: value }));
                      setDerivedInfo({ price: null, previous: null, usage: null });
                      setDeriveError('');
                    }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Meter Image">
                  <Upload
                    accept="image/*"
                    beforeUpload={(selected) => {
                      handleAddFileChange(selected);
                      return false;
                    }}
                    onRemove={() => handleAddFileChange(null)}
                    fileList={uploadFileList}
                    maxCount={1}
                  >
                    <Button icon={<UploadOutlined />}>Select Image</Button>
                  </Upload>
                  <Space direction="vertical" size={2} style={{ marginTop: 8 }}>
                    {predicting && (
                      <Typography.Text type="secondary">
                        Predicting reading...
                      </Typography.Text>
                    )}
                    {!predicting && predictError && (
                      <Typography.Text type="danger">
                        {predictError}
                      </Typography.Text>
                    )}
                  </Space>
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Reading">
                  <Input
                    type="number"
                    value={form.reading_value}
                    onChange={(e) => {
                      const next = e.target.value;
                      setForm((f) => ({ ...f, reading_value: next }));
                      setDerivedInfo({ price: null, previous: null, usage: null });
                      setDeriveError("");
                    }}
                  />
                  {derivedInfo.previous !== null && (
                    <Space direction="vertical" size={2} style={{ marginTop: 8 }}>
                      <Typography.Text type="secondary">
                        Previous reading: {formatUnit(derivedInfo.previous)}
                      </Typography.Text>
                    </Space>
                  )}
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Usage Value">
                  <Input
                    type="number"
                    value={form.value_unit}
                    onChange={(e) => {
                      const next = e.target.value;
                      setForm((f) => ({ ...f, value_unit: next }));
                      setDerivedInfo((info) => ({
                        ...info,
                        price: null,
                        usage: next === '' ? null : Number(next)
                      }));
                      setDeriveError("");
                    }}
                  />
                  <Space direction="vertical" size={2} style={{ marginTop: 8 }}>
                    {derivedInfo.usage !== null && (
                      <Typography.Text type="secondary">
                        Usage this period: {formatUnit(derivedInfo.usage)}
                      </Typography.Text>
                    )}
                    {derivedInfo.previous !== null && derivedInfo.usage !== null && (
                      <Typography.Text type="secondary">
                        Expected current reading: {formatUnit(derivedInfo.previous + derivedInfo.usage)}
                      </Typography.Text>
                    )}
                    {deriving && (
                      <Typography.Text type="secondary">
                        Calculating usage...
                      </Typography.Text>
                    )}
                    {!deriving && deriveError && (
                      <Typography.Text type="danger">
                        {deriveError}
                      </Typography.Text>
                    )}
                  </Space>
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Price Preview">
                  <Input
                    value={displayPrice}
                    disabled
                    style={{ textAlign: "right" }}
                  />
                  {derivedInfo.price !== null && (
                    <div style={{ marginTop: 8 }}>
                      <Typography.Text type="secondary">
                        Estimated charge:{" "}
                        {formatCurrencyValue(derivedInfo.price)}
                      </Typography.Text>
                    </div>
                  )}
                </Form.Item>
              </Col>
            </Row>
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={create}
                disabled={predicting}
              >
                Add
              </Button>
            </Space>
          </Form>
        </Card>

        <Card title="Search Readings" styles={{ body: { paddingTop: 16} }}>
          <Form layout="vertical" colon={false}>
            <Row gutter={[16, 8]}>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Building">
                  <Select
                    allowClear
                    placeholder="All buildings"
                    value={filters.building_code || undefined}
                    onChange={(value) => {
                      const next = value || "";
                      setFilters((f) => ({
                        ...f,
                        building_code: next,
                        room_id: "",
                      }));
                    }}
                    options={buildingOptions.map((code) => ({
                      value: code,
                      label: code,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Room">
                  <Select
                    allowClear
                    placeholder="All rooms"
                    value={filters.room_id || undefined}
                    onChange={(value) =>
                      setFilters((f) => ({ ...f, room_id: value || "" }))
                    }
                    showSearch
                    optionFilterProp="label"
                    options={filterRoomOptions.map((r) => ({
                      value: String(r.id),
                      label: r.building_code
                        ? `${r.building_code}-${r.room_no}`
                        : r.room_no,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="Type">
                  <Select
                    allowClear
                    placeholder="All types"
                    value={filters.type || undefined}
                    onChange={(value) =>
                      setFilters((f) => ({ ...f, type: value || "" }))
                    }
                    options={[
                      { value: "WATER", label: "Water" },
                      { value: "ELECTRIC", label: "Electric" },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="From">
                  <Input
                    type="date"
                    value={filters.date_from}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, date_from: e.target.value }))
                    }
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8} lg={6}>
                <Form.Item label="To">
                  <Input
                    type="date"
                    value={filters.date_to}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, date_to: e.target.value }))
                    }
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={16} lg={12}>
                <Form.Item label=" ">
                  <Space>
                    <Button
                      type="primary"
                      icon={<SearchOutlined />}
                      onClick={applyFilters}
                      loading={loading}
                    >
                      Search
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={resetFilters}
                      disabled={loading}
                    >
                      Reset
                    </Button>
                  </Space>
                </Form.Item>
              </Col>
            </Row>
          </Form>
          <Table
            rowKey="id"
            columns={tableColumns}
            dataSource={filteredItems}
            loading={loading}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{ emptyText: loading ? "Loading..." : "No readings" }}
            scroll={{ x: 760 }}
          />
        </Card>
      </Space>

      <Modal
        title="Edit Meter Reading"
        open={editModalOpen}
        onCancel={closeEditModal}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <Form layout="vertical" colon={false} onFinish={submitEdit}>
          <Row gutter={[16, 8]}>
            <Col xs={24} md={12}>
              <Form.Item label="Building">
                <Select
                  allowClear
                  placeholder="All buildings"
                  value={editBuilding || undefined}
                  onChange={(value) => {
                    const next = value || '';
                    setEditBuilding(next);
                    setEditForm((prev) => ({ ...prev, room_id: '' }));
                  }}
                  options={buildingOptions.map((code) => ({
                    value: code,
                    label: code
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Room" required>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select room"
                  value={editForm.room_id || undefined}
                  onChange={(value) =>
                    setEditForm((prev) => ({ ...prev, room_id: value || '' }))
                  }
                  options={editRoomOptions.map((room) => ({
                    value: room.id,
                    label: room.building_code ? `${room.building_code}-${room.room_no}` : room.room_no
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Type">
                <Select
                  value={editForm.type}
                  onChange={(value) => setEditForm((prev) => ({ ...prev, type: value }))}
                  options={[
                    { value: 'WATER', label: 'Water' },
                    { value: 'ELECTRIC', label: 'Electric' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Reading Date" required>
                <Input
                  type="date"
                  value={editForm.reading_date}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditForm((prev) => {
                      const nextMonth = value ? value.slice(0, 7) : '';
                      const existingMonthFromDate = prev.reading_date ? prev.reading_date.slice(0, 7) : '';
                      const shouldUpdateMonth =
                        !prev.billing_month || prev.billing_month === existingMonthFromDate;
                      return {
                        ...prev,
                        reading_date: value,
                        billing_month: shouldUpdateMonth ? nextMonth : prev.billing_month
                      };
                    });
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Billing Month">
                <Input
                  type="month"
                  value={editForm.billing_month}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, billing_month: e.target.value }))
                  }
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Meter Reading">
                <Input
                  type="number"
                  value={editForm.reading_value}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, reading_value: e.target.value }))
                  }
                  step="0.001"
                  min="0"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Usage Value">
                <Input
                  type="number"
                  value={editForm.value_unit}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEditForm((prev) => ({ ...prev, value_unit: next }));
                    setEditDerivedInfo((info) => ({
                      ...info,
                      price: null,
                      usage: next === '' ? null : Number(next)
                    }));
                  }}
                  step="0.001"
                  min="0"
                />
                <Space direction="vertical" size={2} style={{ marginTop: 8 }}>
                  {editDerivedInfo.previous !== null && (
                    <Typography.Text type="secondary">
                      Previous reading: {formatUnit(editDerivedInfo.previous)}
                    </Typography.Text>
                  )}
                  {editDerivedInfo.usage !== null && (
                    <Typography.Text type="secondary">
                      Usage this period: {formatUnit(editDerivedInfo.usage)}
                    </Typography.Text>
                  )}
                  {editDerivedInfo.previous !== null && editDerivedInfo.usage !== null && (
                    <Typography.Text type="secondary">
                      Expected current reading: {formatUnit(editDerivedInfo.previous + editDerivedInfo.usage)}
                    </Typography.Text>
                  )}
                </Space>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Estimated Amount">
                <Input value={editDisplayPrice} disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Previous Reading">
                <Input
                  value={
                    editDerivedInfo.previous !== null && editDerivedInfo.previous !== undefined
                      ? formatUnit(editDerivedInfo.previous)
                      : '-'
                  }
                  disabled
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Meter Image">
                <Upload
                  accept="image/*"
                  beforeUpload={(selected) => {
                    handleEditFileChange(selected);
                    return false;
                  }}
                  onRemove={() => handleEditRemoveFile()}
                  fileList={editUploadList}
                  maxCount={1}
                >
                  <Button icon={<UploadOutlined />}>Select Image</Button>
                </Upload>
                {editOriginalImage && !editForm.image_path && !editFile && (
                  <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                    Image will be removed when you save.
                  </Typography.Text>
                )}
                {!editOriginalImage && !editFile && (
                  <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                    No image attached.
                  </Typography.Text>
                )}
              </Form.Item>
            </Col>
          </Row>
          {editDeriveError && (
            <Alert type="error" showIcon message={editDeriveError} style={{ marginBottom: 16 }} />
          )}
          <Space style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Button onClick={closeEditModal} disabled={savingEdit}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={savingEdit}>
              Save changes
            </Button>
          </Space>
        </Form>
      </Modal>

      <Modal
        title="Meter Detail"
        open={detailModalOpen}
        onCancel={closeDetail}
        footer={[
          <Button key="close" type="primary" onClick={closeDetail}>
            Close
          </Button>,
        ]}
        width={720}
      >
        {detailItem && (
          <Row gutter={[24, 24]}>
            <Col xs={24} md={14}>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Building">
                  {detailItem.building_code || "-"}
                </Descriptions.Item>
                <Descriptions.Item label="Room">
                  {detailItem.room_no}
                </Descriptions.Item>
                <Descriptions.Item label="Type">
                  {detailItem.type}
                </Descriptions.Item>
                <Descriptions.Item label="Rate">
                  {detailRateValue !== null ? detailRateValue.toFixed(2) : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="Date">
                  {detailItem.reading_date
                    ? detailItem.reading_date.slice(0, 10)
                    : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="Billing Month">
                  {detailItem.billing_month
                    ? detailItem.billing_month.slice(0, 7)
                    : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="Current Reading">
                  {detailReadingDisplay}
                </Descriptions.Item>
                {detailPreviousNumeric !== null && (
                  <Descriptions.Item label="Previous Reading">
                    {formatUnit(detailPreviousNumeric)}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Usage (difference)">
                  {detailValueDisplay}
                </Descriptions.Item>
                <Descriptions.Item label="Computed Reading">
                  {detailComputedReading}
                </Descriptions.Item>
                <Descriptions.Item label="Price">
                  {detailPricePreview}
                </Descriptions.Item>
              </Descriptions>
            </Col>
            <Col xs={24} md={10}>
              {detailImageUrl ? (
                <Image
                  src={detailImageUrl}
                  alt="Meter"
                  width="100%"
                  style={{ borderRadius: 12 }}
                />
              ) : (
                <Alert type="info" message="No image available" showIcon />
              )}
            </Col>
          </Row>
        )}
      </Modal>
    </>
  );
}




