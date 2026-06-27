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
import type { InventoryItem, PaginatedList, ProductModel } from '../types/api-types';

interface StockOutLine {
  key: number;
  modelId?: string | null;
  inventoryItemId?: string | null;
  quantity: number;
}

let lineKey = 0;

function newLine(): StockOutLine {
  return {
    key: ++lineKey,
    modelId: null,
    inventoryItemId: null,
    quantity: 1,
  };
}

export default function StockOutCreatePage() {
  const navigate = useNavigate();
  const [models, setModels] = useState<ProductModel[]>([]);
  const [items, setItems] = useState<StockOutLine[]>([newLine()]);
  const [inventoryOptions, setInventoryOptions] = useState<Record<string, InventoryItem[]>>({});
  const [inventoryLoading, setInventoryLoading] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    api
      .get<PaginatedList<ProductModel>>('/product-models?page=1&pageSize=200')
      .then((res) => setModels(res.items))
      .catch((e) => Message.error(errMessage(e)));
  }, []);

  const loadInventoryForModel = async (lineKeyValue: number, modelId: string) => {
    setInventoryLoading((prev) => ({ ...prev, [lineKeyValue]: true }));
    try {
      const res = await api.get<PaginatedList<InventoryItem>>(
        `/inventory/items?modelId=${modelId}&status=IN_STOCK&page=1&pageSize=200`,
      );
      setInventoryOptions((prev) => ({ ...prev, [lineKeyValue]: res.items }));
    } catch (e) {
      Message.error(errMessage(e));
      setInventoryOptions((prev) => {
        const next = { ...prev };
        delete next[String(lineKeyValue)];
        return next;
      });
    } finally {
      setInventoryLoading((prev) => ({ ...prev, [lineKeyValue]: false }));
    }
  };

  const pickModel = (key: number, modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    setItems((rows) =>
      rows.map((row) =>
        row.key === key
          ? { ...row, modelId: modelId || null, inventoryItemId: null, quantity: 1 }
          : row,
      ),
    );
    if (model?.trackingMode === 'SERIALIZED') {
      void loadInventoryForModel(key, modelId);
    } else {
      setInventoryOptions((prev) => {
        const next = { ...prev };
        delete next[String(key)];
        return next;
      });
    }
  };

  const submit = async () => {
    try {
      setSubmitting(true);
      const values = await form.validate();
      if (!items.length) {
        Message.error('至少一条出库明细');
        return;
      }

      for (const [index, row] of items.entries()) {
        const model = models.find((m) => m.id === row.modelId);
        if (!model) {
          Message.error(`第 ${index + 1} 行请选择型号`);
          return;
        }
        if (model.trackingMode === 'SERIALIZED') {
          if (!row.inventoryItemId) {
            Message.error(`第 ${index + 1} 行请选择库存单品`);
            return;
          }
        } else if (!row.quantity) {
          Message.error(`第 ${index + 1} 行请填写数量`);
          return;
        }
      }
      const serializedIds = items.map((row) => row.inventoryItemId).filter(Boolean);
      if (new Set(serializedIds).size !== serializedIds.length) {
        Message.error('同一张出库单不能重复选择同一个库存单品');
        return;
      }

      await api.post('/stock-out-orders', {
        reason: values.reason || null,
        note: values.note || null,
        items: items.map((row) => {
          const model = models.find((m) => m.id === row.modelId)!;
          return model.trackingMode === 'SERIALIZED'
            ? {
                inventoryItemId: row.inventoryItemId,
                quantity: 1,
              }
            : {
                modelId: model.id,
                quantity: row.quantity,
              };
        }),
      });
      Message.success('出库成功');
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
        <h1 className="page-title" style={{ margin: 0 }}>新建出库</h1>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Space align="start" wrap>
            <Form.Item label="原因" field="reason" style={{ width: 220 }}>
              <Input placeholder="如调拨、报损、盘点出库" />
            </Form.Item>
          </Space>
          <Form.Item label="备注" field="note">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Card>

      <div style={{ marginBottom: 8, fontWeight: 500 }}>出库明细</div>
      {items.map((row, index) => {
        const selectedModel = models.find((model) => model.id === row.modelId);
        return (
          <Card key={row.key} size="small" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>型号</div>
                <Select
                  showSearch
                  placeholder="选择品牌/型号"
                  value={row.modelId || undefined}
                  style={{ width: 300 }}
                  onChange={(value) => pickModel(row.key, value || '')}
                  filterOption={(input, option) =>
                    String(option?.props?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {models.map((model) => (
                    <Select.Option key={model.id} value={model.id}>
                      {`${model.brand?.name ?? '-'} ${model.name}（${model.stock ?? 0}）`}
                    </Select.Option>
                  ))}
                </Select>
              </div>
              {selectedModel?.trackingMode === 'SERIALIZED' ? (
                <div>
                  <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>库存单品</div>
                  <Select
                    placeholder="选择具体单品"
                    showSearch
                    value={row.inventoryItemId || undefined}
                    loading={inventoryLoading[String(row.key)]}
                    style={{ width: 320 }}
                    onChange={(value) =>
                      setItems((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, inventoryItemId: value || null } : item,
                        ),
                      )
                    }
                  >
                    {(inventoryOptions[String(row.key)] ?? []).map((item) => (
                      <Select.Option key={item.id} value={item.id}>
                        {item.imei || item.sn || item.imei2 || `单品 ${item.id}`}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>数量</div>
                  <InputNumber
                    min={1}
                    style={{ width: 100 }}
                    value={row.quantity}
                    onChange={(value) =>
                      setItems((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, quantity: value ?? 1 } : item,
                        ),
                      )
                    }
                  />
                </div>
              )}
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
        <Button type="primary" loading={submitting} onClick={submit}>确认出库</Button>
        <Button onClick={() => navigate('/stock-in')}>取消</Button>
      </Space>
    </>
  );
}
