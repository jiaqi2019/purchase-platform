import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Message, Modal, Select, Table } from '@arco-design/web-react';
import dayjs from 'dayjs';
import { api, errMessage, isFormValidationError } from '../api/http-client';
import type { Buyer, InventoryItem, PaginatedList, ProductModel } from '../types/api-types';
import { formatMoney } from '../utils/format';

interface RepairLineItem {
  key: number;
  modelId?: string | null;
  inventoryItemId?: string | null;
  name: string;
  price: string;
  quantity: number;
}

type RepairOrderRow = {
  id: string;
  buyer?: Buyer;
  externalDevice?: string | null;
  repairFee?: string | number | null;
  items?: Array<{ name: string; price: string | number; quantity: number }>;
};

let lineKey = 0;
const newLine = (): RepairLineItem => ({
  key: ++lineKey,
  modelId: null,
  name: '',
  price: '',
  quantity: 1,
});

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function RepairOrdersPage() {
  const [rows, setRows] = useState<RepairOrderRow[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [models, setModels] = useState<ProductModel[]>([]);
  const [inventoryOptions, setInventoryOptions] = useState<Record<string, InventoryItem[]>>({});
  const [visible, setVisible] = useState(false);
  const [form] = Form.useForm();
  const [items, setItems] = useState<RepairLineItem[]>([newLine()]);

  const load = async () => {
    const [repairRows, buyerRes, modelRes] = await Promise.all([
      api.get<RepairOrderRow[]>('/repair-orders'),
      api.get<PaginatedList<Buyer>>('/buyers?page=1&pageSize=100'),
      api.get<PaginatedList<ProductModel>>('/product-models?page=1&pageSize=200'),
    ]);
    setRows(repairRows);
    setBuyers(buyerRes.items);
    setModels(modelRes.items);
  };

  const loadInventoryForModel = async (lineKeyValue: number, modelId: string) => {
    try {
      const res = await api.get<PaginatedList<InventoryItem>>(
        `/inventory/items?modelId=${modelId}&page=1&pageSize=200`,
      );
      setInventoryOptions((prev) => ({ ...prev, [lineKeyValue]: res.items }));
    } catch {
      setInventoryOptions((prev) => {
        const next = { ...prev };
        delete next[String(lineKeyValue)];
        return next;
      });
    }
  };

  useEffect(() => {
    void load().catch((e) => Message.error(errMessage(e)));
  }, []);

  const pickModel = (key: number, modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    if (modelId) void loadInventoryForModel(key, modelId);
    setItems((rows) =>
      rows.map((row) =>
        row.key === key
          ? {
              ...row,
              modelId: modelId || null,
              inventoryItemId: null,
              name: model ? model.name : row.name,
              price: '',
              quantity: 1,
            }
          : row,
      ),
    );
  };

  const submit = async () => {
    try {
      const v = await form.validate();
      for (const row of items) {
        if (!row.name.trim()) {
          Message.error('请填写配件名称');
          return;
        }
        if (row.price === '' || row.price === undefined) {
          Message.error('请填写价格');
          return;
        }
      }
      await api.post('/repair-orders', {
        buyerId: v.buyerId || null,
        externalDevice: v.externalDevice || null,
        fault: v.fault || null,
        repairFee: v.repairFee || 0,
        repairedAt: dayjs().toISOString(),
        note: v.note || null,
        items: items.map(({ modelId, inventoryItemId, name, price, quantity }) => ({
          modelId: modelId || null,
          inventoryItemId: inventoryItemId || null,
          name,
          price,
          quantity,
        })),
      });
      Message.success('维修单已创建');
      setVisible(false);
      form.resetFields();
      setItems([newLine()]);
      await load();
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    }
  };

  const totalAmount = (row: RepairOrderRow) =>
    toNumber(row.repairFee) +
    (row.items?.reduce((sum, item) => sum + toNumber(item.price) * item.quantity, 0) ?? 0);

  return (
    <>
      <h1 className="page-title">维修订单</h1>
      <Card style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setVisible(true)}>
          新建维修单
        </Button>
      </Card>
      <Table
        rowKey="id"
        data={rows}
        columns={[
          { title: '单号', dataIndex: 'id' },
          { title: '消费者', render: (_, r) => r.buyer?.name ?? '-' },
          { title: '设备', dataIndex: 'externalDevice', render: (v) => v || '-' },
          { title: '配件明细', render: (_, r) => r.items?.map((i) => `${i.name} x ${i.quantity}`).join('、') || '-' },
          { title: '手工费', dataIndex: 'repairFee', render: formatMoney },
          { title: '金额', render: (_, r) => formatMoney(totalAmount(r)) },
        ]}
      />
      <Modal title="新建维修单" visible={visible} onOk={submit} onCancel={() => setVisible(false)} unmountOnExit>
        <Form form={form} layout="vertical">
          <Form.Item label="消费者" field="buyerId">
            <Select allowClear showSearch>
              {buyers.map((b) => (
                <Select.Option key={b.id} value={b.id}>
                  {b.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="设备" field="externalDevice">
            <Input placeholder="非本店出售机器可填写品牌/型号/IMEI" />
          </Form.Item>
          <Form.Item label="故障描述" field="fault">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="手工费" field="repairFee">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="备注" field="note">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>

        <div style={{ marginBottom: 8, fontWeight: 500 }}>配件明细</div>
        {items.map((row) => (
          <Card key={row.key} size="small" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>商品</div>
                <Select
                  style={{ width: 280 }}
                  placeholder="选择配件"
                  showSearch
                  allowClear
                  filterOption={false}
                  value={row.modelId || undefined}
                  onChange={(v) => pickModel(row.key, v || '')}
                >
                  {models.map((m) => (
                    <Select.Option key={m.id} value={m.id}>
                      {`${m.brand?.name ?? '-'} ${m.name}`}
                    </Select.Option>
                  ))}
                </Select>
              </div>
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>名称</div>
                <Input style={{ width: 180 }} value={row.name} disabled />
              </div>
              {inventoryOptions[String(row.key)]?.length ? (
                <div>
                  <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>库存单品</div>
                  <Select
                    style={{ width: 240 }}
                    placeholder="选择具体库存单品"
                    allowClear
                    showSearch
                    value={row.inventoryItemId || undefined}
                    onChange={(v) =>
                      setItems((rows) =>
                        rows.map((r) =>
                          r.key === row.key ? { ...r, inventoryItemId: v || null } : r,
                        ),
                      )
                    }
                  >
                    {(inventoryOptions[String(row.key)] ?? []).map((item) => (
                      <Select.Option key={item.id} value={item.id}>
                        {item.imei || item.imei2 || item.sn || `单品 ${item.id}`}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>价格</div>
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: 120 }}
                  value={row.price === '' ? undefined : Number(row.price)}
                  onChange={(v) =>
                    setItems((rows) =>
                      rows.map((r) =>
                        r.key === row.key ? { ...r, price: v == null ? '' : String(v) } : r,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>数量</div>
                <InputNumber
                  min={1}
                  style={{ width: 80 }}
                  value={row.quantity}
                  onChange={(v) =>
                    setItems((rows) =>
                      rows.map((r) => (r.key === row.key ? { ...r, quantity: v ?? 1 } : r)),
                    )
                  }
                />
              </div>
              {items.length > 1 && (
                <div>
                  <div style={{ marginBottom: 4, height: 22 }} aria-hidden />
                  <Button
                    status="danger"
                    onClick={() => setItems((rows) => rows.filter((r) => r.key !== row.key))}
                  >
                    删除
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
        <Button type="outline" onClick={() => setItems((rows) => [...rows, newLine()])}>
          添加一行
        </Button>
      </Modal>
    </>
  );
}
