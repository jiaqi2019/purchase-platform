import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Message,
  Select,
  Space,
  Switch,
} from '@arco-design/web-react';
import { useNavigate } from 'react-router-dom';
import { api, errMessage, isFormValidationError } from '../api/http-client';
import type {
  Brand,
  ModelSpecDefinition,
  PaginatedList,
  ProductCategory,
  ProductModel,
  ProductTrackingMode,
  SpecValueType,
} from '../types/api-types';

const specTypes: Array<{ label: string; value: SpecValueType }> = [
  { label: '文本', value: 'TEXT' },
  { label: '数字', value: 'NUMBER' },
  { label: '单选', value: 'SINGLE_SELECT' },
  { label: '多选', value: 'MULTI_SELECT' },
  { label: '日期', value: 'DATE' },
];

interface SpecDraft {
  key: number;
  name: string;
  code: string;
  valueType: SpecValueType;
  required: boolean;
  uniqueValue: boolean;
  options: string[];
}

let specKey = 0;
const newSpec = (): SpecDraft => ({
  key: ++specKey,
  name: '',
  code: '',
  valueType: 'TEXT',
  required: false,
  uniqueValue: false,
  options: [],
});

const serializedDefaultSpecs = (): SpecDraft[] => [
  {
    key: ++specKey,
    name: 'IMEI',
    code: 'imei',
    valueType: 'TEXT',
    required: true,
    uniqueValue: true,
    options: [],
  },
  {
    key: ++specKey,
    name: 'IMEI2',
    code: 'imei2',
    valueType: 'TEXT',
    required: true,
    uniqueValue: true,
    options: [],
  },
  {
    key: ++specKey,
    name: 'SN',
    code: 'sn',
    valueType: 'TEXT',
    required: true,
    uniqueValue: true,
    options: [],
  },
  {
    key: ++specKey,
    name: '颜色',
    code: 'color',
    valueType: 'SINGLE_SELECT',
    required: false,
    uniqueValue: false,
    options: ['黑色', '白色'],
  },
  {
    key: ++specKey,
    name: '运行内存',
    code: 'memory',
    valueType: 'SINGLE_SELECT',
    required: false,
    uniqueValue: false,
    options: ['8GB', '12GB'],
  },
  {
    key: ++specKey,
    name: '存储容量',
    code: 'storage',
    valueType: 'SINGLE_SELECT',
    required: false,
    uniqueValue: false,
    options: ['128GB', '256GB'],
  },
];

function toOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export default function ProductModelCreatePage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [existingModels, setExistingModels] = useState<ProductModel[]>([]);
  const [specs, setSpecs] = useState<SpecDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const selectedCategoryId = Form.useWatch('categoryId', form);

  const specSuggestions = useMemo(() => {
    if (!selectedCategoryId) return [];
    const map = new Map<string, ModelSpecDefinition>();
    for (const model of existingModels) {
      if (model.categoryId !== selectedCategoryId) continue;
      for (const spec of model.specDefinitions ?? []) {
        if (!map.has(spec.name)) map.set(spec.name, spec);
      }
    }
    return [...map.values()];
  }, [existingModels, selectedCategoryId]);

  useEffect(() => {
    form.setFieldsValue({ trackingMode: 'SERIALIZED', active: true });
    setSpecs(serializedDefaultSpecs());
    api.get<ProductCategory[]>('/product-categories').then(setCategories).catch(() => {});
    api.get<Brand[]>('/brands').then(setBrands).catch(() => {});
    api
      .get<PaginatedList<ProductModel>>('/product-models?page=1&pageSize=200')
      .then((res) => setExistingModels(res.items))
      .catch(() => {});
  }, [form]);

  const submit = async () => {
    try {
      setSubmitting(true);
      const values = await form.validate();
      const validSpecs = specs.filter((s) => s.name.trim());
      if (values.trackingMode === 'SERIALIZED' && !validSpecs.some((s) => s.uniqueValue)) {
        Message.error('单品追踪型号至少需要一个唯一标识规格');
        return;
      }
      await api.post('/product-models', {
        ...values,
        specs: validSpecs.map(({ key: _key, options, ...s }, index) => ({
            ...s,
            options: [...new Set(options.map((option) => option.trim()).filter(Boolean))],
            sortOrder: index,
        })),
      });
      Message.success('型号已创建');
      navigate('/models');
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const updateSpec = (key: number, patch: Partial<SpecDraft>) => {
    setSpecs((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const pickSpecName = (spec: SpecDraft, name: string) => {
    const existing = specSuggestions.find((item) => item.name === name);
    if (existing) {
      updateSpec(spec.key, {
        name: existing.name,
        code: existing.code,
        valueType: existing.valueType,
        required: existing.required,
        uniqueValue: existing.uniqueValue,
        options: toOptions(existing.options),
      });
      return;
    }
    updateSpec(spec.key, { name, code: '' });
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button onClick={() => navigate('/models')}>返回</Button>
        <h1 className="page-title" style={{ margin: 0 }}>新建型号</h1>
      </div>

      <Card title="基础信息" style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Space style={{ width: '100%' }} align="start" wrap>
            <Form.Item label="品类" field="categoryId" rules={[{ required: true }]} style={{ width: 220 }}>
              <Select>
                {categories.map((c) => (
                  <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="品牌" field="brandId" rules={[{ required: true }]} style={{ width: 220 }}>
              <Select>
                {brands.map((b) => (
                  <Select.Option key={b.id} value={b.id}>{b.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="型号" field="name" rules={[{ required: true }]} style={{ width: 280 }}>
              <Input />
            </Form.Item>
          </Space>
          <Space align="start" wrap>
            <Form.Item label="库存方式" field="trackingMode" rules={[{ required: true }]} style={{ width: 220 }}>
              <Select
                onChange={(value) => {
                  if (value === 'SERIALIZED') {
                    setSpecs((rows) => (rows.length ? rows : serializedDefaultSpecs()));
                  } else if (value === 'QUANTITY') {
                    setSpecs([]);
                  }
                }}
              >
                <Select.Option value={'SERIALIZED' satisfies ProductTrackingMode}>单品追踪</Select.Option>
                <Select.Option value={'QUANTITY' satisfies ProductTrackingMode}>数量库存</Select.Option>
              </Select>
            </Form.Item>
          </Space>
        </Form>
      </Card>

      <Card
        title="入库规格"
        style={{ marginBottom: 16 }}
      >
        {specs.map((spec) => (
          <Card key={spec.key} size="small" style={{ marginBottom: 8 }}>
            <Space wrap>
              <Select
                style={{ width: 180 }}
                placeholder="规格名称"
                showSearch
                allowCreate
                allowClear
                value={spec.name}
                onChange={(name) => pickSpecName(spec, name || '')}
                filterOption={(inputValue, option) =>
                  String(option?.props?.children ?? '')
                    .toLowerCase()
                    .includes(inputValue.trim().toLowerCase())
                }
              >
                {specSuggestions.map((suggestion) => (
                  <Select.Option key={suggestion.name} value={suggestion.name}>
                    {suggestion.name}
                  </Select.Option>
                ))}
              </Select>
              <Select
                style={{ width: 140 }}
                value={spec.valueType}
                onChange={(valueType) =>
                  updateSpec(spec.key, {
                    valueType,
                    options:
                      (valueType === 'SINGLE_SELECT' || valueType === 'MULTI_SELECT') &&
                      spec.options.length === 0
                        ? ['']
                        : spec.options,
                  })
                }
              >
                {specTypes.map((t) => (
                  <Select.Option key={t.value} value={t.value}>{t.label}</Select.Option>
                ))}
              </Select>
              <Switch
                checkedText="必填"
                uncheckedText="选填"
                checked={spec.required}
                onChange={(required) => updateSpec(spec.key, { required })}
              />
              <Switch
                checkedText="唯一标识"
                uncheckedText="可重复"
                checked={spec.uniqueValue}
                onChange={(uniqueValue) => updateSpec(spec.key, { uniqueValue })}
              />
              <Button status="danger" onClick={() => setSpecs((rows) => rows.filter((r) => r.key !== spec.key))}>
                删除规格
              </Button>
            </Space>
            {(spec.valueType === 'SINGLE_SELECT' || spec.valueType === 'MULTI_SELECT') && (
              <div style={{ marginTop: 10 }}>
                <div style={{ marginBottom: 6, color: 'var(--color-text-3)' }}>可选值</div>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {spec.options.map((option, optionIndex) => (
                    <Space key={optionIndex}>
                      <Input
                        style={{ width: 260 }}
                        placeholder="例如黑色"
                        value={option}
                        onChange={(value) =>
                          updateSpec(spec.key, {
                            options: spec.options.map((item, index) =>
                              index === optionIndex ? value : item,
                            ),
                          })
                        }
                      />
                      <Button
                        status="danger"
                        disabled={spec.options.length <= 1}
                        onClick={() =>
                          updateSpec(spec.key, {
                            options: spec.options.filter((_, index) => index !== optionIndex),
                          })
                        }
                      >
                        删除选项
                      </Button>
                    </Space>
                  ))}
                  <Button type="outline" onClick={() => updateSpec(spec.key, { options: [...spec.options, ''] })}>
                    添加选项
                  </Button>
                </Space>
              </div>
            )}
          </Card>
        ))}
        <Button
          type="outline"
          onClick={() =>
            setSpecs((rows) => [...rows, newSpec()])
          }
        >
          添加规格
        </Button>
      </Card>

      <Space>
        <Button type="primary" loading={submitting} onClick={submit}>保存型号</Button>
        <Button onClick={() => navigate('/models')}>取消</Button>
      </Space>
    </>
  );
}
