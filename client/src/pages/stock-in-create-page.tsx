import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Message,
  Select,
  Space,
} from '@arco-design/web-react';
import { useNavigate } from 'react-router-dom';
import { api, errMessage, isFormValidationError } from '../api/http-client';
import type { ModelSpecDefinition, PaginatedList, ProductModel, PurchaseChannel } from '../types/api-types';

function getOptions(spec: ModelSpecDefinition): string[] {
  return Array.isArray(spec.options) ? spec.options.map(String).filter(Boolean) : [];
}

interface StockInLine {
  key: number;
  modelId?: string | null;
  costPrice: string;
  quantity: number;
  attributes: Record<string, unknown>;
}

let lineKey = 0;

function newLine(): StockInLine {
  return {
    key: ++lineKey,
    modelId: null,
    costPrice: '',
    quantity: 1,
    attributes: {},
  };
}

function renderSpecInput(
  spec: ModelSpecDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  const options = getOptions(spec);
  if (options.length > 0 || spec.valueType === 'SINGLE_SELECT' || spec.valueType === 'MULTI_SELECT') {
    return (
      <Select
        mode={spec.valueType === 'MULTI_SELECT' ? 'multiple' : undefined}
        allowClear
        placeholder={options.length ? '请选择' : '暂无可选值'}
        disabled={!options.length}
        value={value as string | string[] | undefined}
        onChange={onChange}
      >
        {options.map((option) => (
          <Select.Option key={option} value={option}>
            {option}
          </Select.Option>
        ))}
      </Select>
    );
  }
  if (spec.valueType === 'NUMBER') {
    return (
      <InputNumber
        precision={0}
        style={{ width: '100%' }}
        value={value as number | undefined}
        onChange={onChange}
      />
    );
  }
  return <Input value={value as string | undefined} onChange={onChange} />;
}

export default function StockInCreatePage() {
  const navigate = useNavigate();
  const [models, setModels] = useState<ProductModel[]>([]);
  const [channels, setChannels] = useState<PurchaseChannel[]>([]);
  const [items, setItems] = useState<StockInLine[]>([newLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    Promise.all([
      api.get<PaginatedList<ProductModel>>('/product-models?page=1&pageSize=200'),
      api.get<PaginatedList<PurchaseChannel>>('/purchase-channels?page=1&pageSize=200'),
    ])
      .then(([modelRes, channelRes]) => {
        setModels(modelRes.items);
        setChannels(channelRes.items);
      })
      .catch((e) => Message.error(errMessage(e)));
  }, []);

  const submit = async () => {
    try {
      setSubmitting(true);
      const values = await form.validate();
      if (!items.length) {
        Message.error('至少一条入库明细');
        return;
      }

      for (const [index, row] of items.entries()) {
        const model = models.find((m) => m.id === row.modelId);
        if (!model) {
          Message.error(`第 ${index + 1} 行请选择型号`);
          return;
        }
        if (row.costPrice === '' || row.costPrice == null) {
          Message.error(`第 ${index + 1} 行请填写成本价`);
          return;
        }
        if (model.trackingMode === 'QUANTITY' && !row.quantity) {
          Message.error(`第 ${index + 1} 行请填写数量`);
          return;
        }
        for (const spec of model.specDefinitions ?? []) {
          if (!spec.required && !spec.uniqueValue) continue;
          const value = row.attributes[spec.code];
          if (value == null || value === '' || (Array.isArray(value) && !value.length)) {
            Message.error(`第 ${index + 1} 行 ${spec.name} 必填`);
            return;
          }
        }
      }

      await api.post('/stock-in-orders', {
        source: values.source || null,
        note: values.note || null,
        items: items.map((row) => {
          const model = models.find((m) => m.id === row.modelId)!;
          return model.trackingMode === 'SERIALIZED'
            ? {
                modelId: model.id,
                costPrice: row.costPrice,
                serializedItems: [{ attributes: row.attributes, costPrice: row.costPrice }],
              }
            : {
                modelId: model.id,
                quantity: row.quantity,
                costPrice: row.costPrice,
                attributes: row.attributes,
              };
        }),
      });
      Message.success('入库成功');
      navigate('/stock-in');
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button onClick={() => navigate('/stock-in')}>返回</Button>
        <h1 className="page-title" style={{ margin: 0 }}>新建入库</h1>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Space align="start" wrap>
            <Form.Item label="采购渠道" field="source" style={{ width: 260 }}>
              <Select
                allowClear
                showSearch
                placeholder="搜索采购渠道"
                filterOption={(input, option) =>
                  String(option?.props?.children ?? '').toLowerCase().includes(input.toLowerCase())
                }
              >
                {channels.map((channel) => (
                  <Select.Option key={channel.id} value={channel.name}>
                    {channel.contact ? `${channel.name}（${channel.contact}）` : channel.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Space>
          <Form.Item label="备注" field="note">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Card>

      <div style={{ marginBottom: 8, fontWeight: 500 }}>入库明细</div>
      {items.map((row, index) => {
        const selectedModel = models.find((model) => model.id === row.modelId);
        return (
          <Card key={row.key} size="small" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>型号</div>
                <Select
                  style={{ width: 300 }}
                  showSearch
                  placeholder="选择品牌/型号"
                  value={row.modelId || undefined}
                  onChange={(v) => {
                    setItems((rows) =>
                      rows.map((item) =>
                        item.key === row.key
                          ? { ...item, modelId: v || null, quantity: 1, attributes: {} }
                          : item,
                      ),
                    );
                  }}
                  filterOption={(input, option) =>
                    String(option?.props?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {models.map((m) => (
                    <Select.Option key={m.id} value={m.id}>{`${m.brand?.name ?? '-'} ${m.name}`}</Select.Option>
                  ))}
                </Select>
              </div>
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>成本价</div>
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: 140 }}
                  value={row.costPrice === '' ? undefined : Number(row.costPrice)}
                  onChange={(v) =>
                    setItems((rows) =>
                      rows.map((item) =>
                        item.key === row.key ? { ...item, costPrice: v == null ? '' : String(v) } : item,
                      ),
                    )
                  }
                />
              </div>
              {selectedModel?.trackingMode === 'QUANTITY' && (
                <div>
                  <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>数量</div>
                  <InputNumber
                    min={1}
                    style={{ width: 100 }}
                    value={row.quantity}
                    onChange={(v) =>
                      setItems((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, quantity: v ?? 1 } : item,
                        ),
                      )
                    }
                  />
                </div>
              )}
              {selectedModel?.specDefinitions?.map((spec) => (
                <div key={spec.id}>
                  <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>
                    {spec.name}
                    {(spec.required || spec.uniqueValue) && <span style={{ color: 'rgb(var(--red-6))' }}> *</span>}
                  </div>
                  <div style={{ width: 200 }}>
                    {renderSpecInput(spec, row.attributes[spec.code], (value) =>
                      setItems((rows) =>
                        rows.map((item) =>
                          item.key === row.key
                            ? { ...item, attributes: { ...item.attributes, [spec.code]: value } }
                            : item,
                        ),
                      ),
                    )}
                  </div>
                </div>
              ))}
              {items.length > 1 && (
                <div>
                  <div style={{ marginBottom: 4, height: 22 }} aria-hidden />
                  <Button
                    status="danger"
                    onClick={() => setItems((rows) => rows.filter((item) => item.key !== row.key))}
                  >
                    删除
                  </Button>
                </div>
              )}
            </div>
            <div style={{ marginTop: 8, color: 'var(--color-text-3)' }}>第 {index + 1} 行</div>
          </Card>
        );
      })}
      <Space>
        <Button type="outline" onClick={() => setItems((rows) => [...rows, newLine()])}>
          添加一行
        </Button>
        <Button type="primary" loading={submitting} onClick={submit}>确认入库</Button>
        <Button onClick={() => navigate('/stock-in')}>取消</Button>
      </Space>
    </>
  );
}
