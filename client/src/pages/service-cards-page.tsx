import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import debounce from 'lodash/debounce';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Message,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { api, errMessage, isFormValidationError } from '../api/http-client';
import type { Buyer, InventoryItem, PaginatedList, ProductModel, ServiceCard } from '../types/api-types';
import { formatMoney } from '../utils/format';

interface ServiceLineItem {
  key: number;
  productId?: string | null;
  inventoryItemId?: string | null;
  name: string;
  price: string;
  quantity: number;
}

type ServiceOrderRow = {
  id: string;
  serviceCardId: string | null;
  servedAt: string;
  note: string | null;
  items: Array<{
    name: string;
    price: string | number;
    costPrice?: string | number | null;
    quantity: number;
    inventoryItem?: { costPrice?: string | number | null } | null;
  }>;
};

let lineKey = 0;
const newLine = (): ServiceLineItem => ({
  key: ++lineKey,
  productId: null,
  inventoryItemId: null,
  name: '',
  price: '',
  quantity: 1,
});

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function lineTotal(price: string | number, quantity: number): number {
  return toNumber(price) * quantity;
}

function itemCost(item: {
  costPrice?: string | number | null;
  inventoryItem?: { costPrice?: string | number | null } | null;
  quantity: number;
}): number {
  const unit = item.costPrice ?? item.inventoryItem?.costPrice ?? 0;
  return toNumber(unit) * item.quantity;
}

function formatProductOptionLabel(p: ProductModel): string {
  return `${p.brand?.name ?? '-'}-${p.name}（${p.stock}）`;
}

export default function ServiceCardsPage() {
  const [cards, setCards] = useState<ServiceCard[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrderRow[]>([]);
  const [productOptions, setProductOptions] = useState<ProductModel[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [inventoryOptions, setInventoryOptions] = useState<Record<string, InventoryItem[]>>({});
  const [inventoryLoading, setInventoryLoading] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState(false);
  const [serviceVisible, setServiceVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ServiceCard | null>(null);
  const [form] = Form.useForm();
  const [serviceForm] = Form.useForm();
  const [items, setItems] = useState<ServiceLineItem[]>([newLine()]);
  const productPageRef = useRef(1);
  const productQueryRef = useRef('');
  const productHasMoreRef = useRef(false);
  const productsLoadingRef = useRef(false);

  const load = async () => {
    const [cardRows, buyerRes, orders] = await Promise.all([
      api.get<ServiceCard[]>('/service-cards'),
      api.get<PaginatedList<Buyer>>('/buyers?page=1&pageSize=100'),
      api.get<ServiceOrderRow[]>('/service-orders'),
    ]);
    setCards(cardRows);
    setBuyers(buyerRes.items);
    setServiceOrders(orders);
  };

  const loadProductOptions = useCallback(async (q: string, page: number, append: boolean) => {
    if (productsLoadingRef.current) return;
    productsLoadingRef.current = true;
    setProductsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (q.trim()) params.set('q', q.trim());
      const res = await api.get<PaginatedList<ProductModel>>(`/product-models?${params}`);
      productPageRef.current = page;
      productQueryRef.current = q;
      productHasMoreRef.current = res.hasMore;
      setProductOptions((prev) => (append ? [...prev, ...res.items] : res.items));
    } finally {
      productsLoadingRef.current = false;
      setProductsLoading(false);
    }
  }, []);

  const debouncedProductSearch = useMemo(
    () =>
      debounce((value: string) => {
        void loadProductOptions(value, 1, false);
      }, 300),
    [loadProductOptions],
  );

  useEffect(() => () => debouncedProductSearch.cancel(), [debouncedProductSearch]);

  const loadInventoryForProduct = async (lineKeyValue: number, productId: string) => {
    if (inventoryLoading[String(lineKeyValue)]) return;
    setInventoryLoading((prev) => ({ ...prev, [lineKeyValue]: true }));
    try {
      const res = await api.get<PaginatedList<InventoryItem>>(
        `/inventory/items?modelId=${productId}&page=1&pageSize=200`,
      );
      setInventoryOptions((prev) => ({
        ...prev,
        [lineKeyValue]: res.items.filter(
          (item) => item.status === 'IN_STOCK' || item.status === 'RETURNED_IN_STOCK',
        ),
      }));
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setInventoryLoading((prev) => ({ ...prev, [lineKeyValue]: false }));
    }
  };

  const pickProduct = (key: number, productId: string) => {
    const p = productOptions.find((x) => x.id === productId);
    if (p?.trackingMode === 'SERIALIZED') {
      void loadInventoryForProduct(key, productId);
    } else {
      setInventoryOptions((prev) => {
        const next = { ...prev };
        delete next[String(key)];
        return next;
      });
    }
    setItems((rows) =>
      rows.map((row) =>
        row.key === key
          ? {
              ...row,
              productId: productId || null,
              inventoryItemId: null,
              name: p ? p.name : row.name,
              price: '',
              quantity: p?.trackingMode === 'SERIALIZED' ? 1 : row.quantity,
            }
          : row,
      ),
    );
  };

  const pickInventoryItem = (key: number, inventoryItemId: string) => {
    setItems((rows) =>
      rows.map((row) =>
        row.key === key
          ? {
              ...row,
              inventoryItemId: inventoryItemId || null,
            }
          : row,
      ),
    );
  };

  const handleProductSearch = (value: string) => {
    debouncedProductSearch(value);
  };

  const handleProductPopupScroll = (elem: HTMLDivElement) => {
    if (productsLoadingRef.current) return;
    if (elem.scrollTop + elem.clientHeight < elem.scrollHeight - 8) return;
    if (!productHasMoreRef.current) return;
    void loadProductOptions(productQueryRef.current, productPageRef.current + 1, true);
  };

  const statsByCardId = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number; count: number }>();
    for (const order of serviceOrders) {
      if (!order.serviceCardId) continue;
      const prev = map.get(order.serviceCardId) ?? { revenue: 0, cost: 0, count: 0 };
      prev.count += 1;
      for (const item of order.items) {
        prev.revenue += lineTotal(item.price, item.quantity);
        prev.cost += itemCost(item);
      }
      map.set(order.serviceCardId, prev);
    }
    return map;
  }, [serviceOrders]);

  const totalRecharge = useMemo(
    () => cards.reduce((sum, card) => sum + toNumber(card.rechargeAmount), 0),
    [cards],
  );
  const overCostCount = useMemo(
    () =>
      cards.filter((card) => {
        const stat = statsByCardId.get(card.id);
        return (stat?.cost ?? 0) > toNumber(card.rechargeAmount);
      }).length,
    [cards, statsByCardId],
  );

  useEffect(() => {
    void load().catch((e) => Message.error(errMessage(e)));
    void loadProductOptions('', 1, false).catch(() => {});
  }, []);

  const submitCard = async () => {
    try {
      const v = await form.validate();
      await api.post('/service-cards', v);
      Message.success('次卡已创建');
      setVisible(false);
      form.resetFields();
      await load();
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    }
  };

  const submitService = async () => {
    try {
      const v = await serviceForm.validate();
      const card = cards.find((c) => c.id === v.serviceCardId);
      if (!card) {
        Message.error('请选择次卡');
        return;
      }
      for (const row of items) {
        if (!row.name.trim()) {
          Message.error('请填写商品名称');
          return;
        }
        const product = row.productId ? productOptions.find((p) => p.id === row.productId) : null;
        if (product?.trackingMode === 'SERIALIZED' && !row.inventoryItemId) {
          Message.error('单品追踪商品必须选择具体库存单品');
          return;
        }
        if (row.price === '' || row.price === undefined) {
          Message.error('请填写卖价');
          return;
        }
      }
      await api.post('/service-orders', {
        buyerId: card.buyerId,
        serviceCardId: v.serviceCardId,
        timesUsed: v.timesUsed || 1,
        note: v.note || null,
        items: items.map(({ productId, inventoryItemId, name, price, quantity }) => ({
          modelId: productId || null,
          inventoryItemId: inventoryItemId || null,
          name,
          price,
          quantity,
        })),
      });
      Message.success('服务已核销');
      setServiceVisible(false);
      serviceForm.resetFields();
      setItems([newLine()]);
      setInventoryOptions({});
      await load();
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    }
  };

  const openService = () => {
    setServiceVisible(true);
    serviceForm.resetFields();
    serviceForm.setFieldsValue({ timesUsed: 1 });
    setItems([newLine()]);
    setInventoryOptions({});
  };

  const openDetail = (card: ServiceCard) => {
    setSelectedCard(card);
    setDetailVisible(true);
  };

  const selectedCardOrders = useMemo(
    () => serviceOrders.filter((order) => order.serviceCardId === selectedCard?.id),
    [serviceOrders, selectedCard],
  );

  return (
    <>
      <h1 className="page-title">次卡服务</h1>
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" onClick={() => setVisible(true)}>
            新建次卡
          </Button>
          <Button onClick={openService}>服务核销</Button>
        </Space>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
          <Statistic title="次卡充值总额" value={totalRecharge} prefix="¥" precision={2} />
          <Statistic title="超成本次卡" value={overCostCount} />
        </Space>
      </Card>

      <Table
        rowKey="id"
        data={cards}
        columns={[
          { title: '消费者', render: (_, r) => r.buyer?.name ?? '-' },
          { title: '服务', dataIndex: 'serviceName' },
          { title: '充值金额', dataIndex: 'rechargeAmount', render: formatMoney },
          { title: '总次数', dataIndex: 'totalTimes' },
          { title: '剩余次数', dataIndex: 'remainingTimes' },
          {
            title: '剩余履约金额',
            render: (_, r) => {
              if (r.totalTimes <= 0) return '-';
              const amount = (toNumber(r.rechargeAmount) * r.remainingTimes) / r.totalTimes;
              return formatMoney(amount);
            },
          },
          {
            title: '状态',
            render: (_, r) => {
              const cost = statsByCardId.get(r.id)?.cost ?? 0;
              return cost > toNumber(r.rechargeAmount) ? (
                <Tag color="red">已超成本</Tag>
              ) : (
                <Tag color="green">正常</Tag>
              );
            },
          },
          {
            title: '操作',
            render: (_, r) => (
              <Button size="small" onClick={() => openDetail(r)}>
                查看明细
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title="新建次卡"
        visible={visible}
        onOk={submitCard}
        onCancel={() => setVisible(false)}
        unmountOnExit
      >
        <Form form={form} layout="vertical">
          <Form.Item label="消费者" field="buyerId" rules={[{ required: true }]}>
            <Select showSearch allowClear>
              {buyers.map((b) => (
                <Select.Option key={b.id} value={b.id}>
                  {b.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="服务名称" field="serviceName" rules={[{ required: true }]}>
            <Input placeholder="如贴膜服务" />
          </Form.Item>
          <Form.Item label="充值金额" field="rechargeAmount" rules={[{ required: true }]}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="次数" field="totalTimes" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="服务核销"
        visible={serviceVisible}
        onOk={submitService}
        onCancel={() => setServiceVisible(false)}
        style={{ width: 780 }}
        unmountOnExit
      >
        <Form form={serviceForm} layout="vertical">
          <Form.Item label="次卡" field="serviceCardId" rules={[{ required: true }]}>
            <Select
              showSearch
              allowClear
              onChange={() => {
                setItems([newLine()]);
                setInventoryOptions({});
              }}
            >
              {cards.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {`${c.buyer?.name ?? '-'} ${c.serviceName}（剩余 ${c.remainingTimes} 次）`}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="核销次数" field="timesUsed">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="备注" field="note">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>商品明细</div>
        {items.map((row) => (
          <Card key={row.key} size="small" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>商品</div>
                <Select
                  style={{ width: 280 }}
                  placeholder="输入品牌或名称搜索"
                  showSearch
                  allowClear
                  loading={productsLoading}
                  filterOption={false}
                  value={row.productId || undefined}
                  onChange={(v) => pickProduct(row.key, v || '')}
                  onSearch={handleProductSearch}
                  onPopupScroll={handleProductPopupScroll}
                >
                  {productOptions.map((p) => (
                    <Select.Option key={p.id} value={p.id}>
                      {formatProductOptionLabel(p)}
                    </Select.Option>
                  ))}
                </Select>
              </div>
              {productOptions.find((p) => p.id === row.productId)?.trackingMode === 'SERIALIZED' && (
                <div>
                  <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>库存单品</div>
                  <Select
                    style={{ width: 240 }}
                    placeholder="选择具体库存单品"
                    showSearch
                    allowClear
                    loading={inventoryLoading[String(row.key)]}
                    value={row.inventoryItemId || undefined}
                    onChange={(v) => pickInventoryItem(row.key, v || '')}
                  >
                    {(inventoryOptions[String(row.key)] ?? []).map((item) => (
                      <Select.Option key={item.id} value={item.id}>
                        {item.imei || item.imei2 || item.sn || `单品 ${item.id}`}
                      </Select.Option>
                    ))}
                  </Select>
                </div>
              )}
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>名称</div>
                <Input style={{ width: 160 }} value={row.name} disabled />
              </div>
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>卖价</div>
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
                  disabled={
                    productOptions.find((p) => p.id === row.productId)?.trackingMode === 'SERIALIZED'
                  }
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
                  <Button status="danger" onClick={() => setItems((rows) => rows.filter((r) => r.key !== row.key))}>
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
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          系统会按已核销服务的商品成本统计，若累计成本高于次卡充值金额，会在上方列表标记为“已超成本”。
        </Typography.Text>
      </Modal>

      <Modal
        title="次卡明细"
        visible={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        unmountOnExit
        style={{ width: 920 }}
      >
        {selectedCard ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Card size="small">
              <Space direction="vertical" size={4}>
                <div>消费者：{selectedCard.buyer?.name ?? '-'}</div>
                <div>服务：{selectedCard.serviceName}</div>
                <div>充值金额：{formatMoney(selectedCard.rechargeAmount)}</div>
                <div>总次数：{selectedCard.totalTimes}</div>
                <div>剩余次数：{selectedCard.remainingTimes}</div>
                <div>已核销金额：{formatMoney(statsByCardId.get(selectedCard.id)?.revenue ?? 0)}</div>
                <div>
                  状态：
                  {(statsByCardId.get(selectedCard.id)?.cost ?? 0) > toNumber(selectedCard.rechargeAmount) ? (
                    <Tag color="red">已超成本</Tag>
                  ) : (
                    <Tag color="green">正常</Tag>
                  )}
                </div>
              </Space>
            </Card>
            <Table
              rowKey="id"
              data={selectedCardOrders}
              pagination={false}
              columns={[
                {
                  title: '核销时间',
                  render: (_, row) => new Date(row.servedAt).toLocaleString('zh-CN'),
                },
                { title: '核销次数', dataIndex: 'timesUsed' },
                {
                  title: '商品',
                  render: (_, row) =>
                    row.items.map((item) => `${item.name} × ${item.quantity}`).join('、') || '-',
                },
                {
                  title: '金额',
                  render: (_, row) =>
                    formatMoney(row.items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)),
                },
                {
                  title: '备注',
                  render: (_, row) => row.note || '-',
                },
              ]}
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
