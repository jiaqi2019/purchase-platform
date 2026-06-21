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
  DatePicker,
} from '@arco-design/web-react';
import dayjs, { type Dayjs } from 'dayjs';
import { IconPlus, IconRefresh } from '@arco-design/web-react/icon';
import { api, errMessage, isFormValidationError } from '../api/http-client';
import type {
  Brand,
  Buyer,
  InventoryItem,
  PaginatedList,
  ProductModel,
  Purchase,
  PurchaseQueryResult,
} from '../types/api-types';
import { formatMoney } from '../utils/format';
import { PAGE_SIZE, paginationTotal } from '../utils/pagination';
import { confirmDelete } from '../utils/confirm-delete';

interface LineItem {
  key: number;
  productId?: string | null;
  inventoryItemId?: string | null;
  name: string;
  price: string;
  quantity: number;
}

interface Filters {
  buyerName: string;
  brand: string;
  productName: string;
  dateRange?: Dayjs[];
}

const emptyFilters: Filters = { buyerName: '', brand: '', productName: '' };
const PRODUCT_OPTION_PAGE_SIZE = 5;

let lineKey = 0;
const newLine = (): LineItem => ({
  key: ++lineKey,
  productId: null,
  inventoryItemId: null,
  name: '',
  price: '',
  quantity: 1,
});

function lineTotal(price: string | number, qty: number): number {
  return Number(price) * qty;
}

function orderTotal(order: Purchase): number {
  return order.items.reduce((sum, item) => sum + lineTotal(item.price, item.quantity), 0);
}

function summarizeOrderItems(order: Purchase): string {
  const names = order.items.map((item) => item.name).filter(Boolean);
  if (!names.length) return '-';
  if (names.length <= 2) return names.join('、');
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 项`;
}

function getOrderAfterSaleState(order: Purchase): {
  label: string;
  color: 'gray' | 'blue' | 'orange' | 'green' | 'red';
} {
  const statuses = order.items.map((item) => item.status ?? 'SOLD');
  if (!statuses.length) return { label: '-', color: 'gray' };
  if (statuses.every((status) => status === 'RETURNED' || status === 'EXCHANGED')) {
    return { label: '已售后', color: 'green' };
  }
  if (statuses.some((status) => status === 'EXCHANGING')) {
    return { label: '售后中', color: 'orange' };
  }
  if (statuses.some((status) => status === 'RETURNED' || status === 'EXCHANGED')) {
    return { label: '部分售后', color: 'blue' };
  }
  if (order.afterSales?.some((afterSale) => afterSale.status === 'PROCESSING')) {
    return { label: '售后处理中', color: 'orange' };
  }
  return { label: '未售后', color: 'gray' };
}

function isOrderItemEligibleForAfterSale(item: Purchase['items'][number]): boolean {
  return (item.status ?? 'SOLD') === 'SOLD';
}

function afterSaleTypeLabel(type: string): string {
  return type === 'RETURN' ? '退货' : '换货';
}

function afterSaleStatusLabel(status: string): { label: string; color: 'gray' | 'blue' | 'orange' | 'green' | 'red' } {
  if (status === 'COMPLETED') return { label: '已结束', color: 'green' };
  if (status === 'PROCESSING') return { label: '售后中', color: 'orange' };
  if (status === 'PENDING') return { label: '待处理', color: 'gray' };
  if (status === 'CANCELLED') return { label: '已取消', color: 'red' };
  return { label: status, color: 'blue' };
}

function formatProductOptionLabel(p: ProductModel): string {
  const brand = p.brand?.name ?? '-';
  return `${brand}-${p.name}（${p.stock}）`;
}

export default function ConsumptionListPage() {
  const [buyerOptions, setBuyerOptions] = useState<Buyer[]>([]);
  const [buyersLoading, setBuyersLoading] = useState(false);
  const [productOptions, setProductOptions] = useState<ProductModel[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [inventoryOptions, setInventoryOptions] = useState<Record<string, InventoryItem[]>>({});
  const [inventoryLoading, setInventoryLoading] = useState<Record<string, boolean>>({});
  const [brands, setBrands] = useState<Brand[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [result, setResult] = useState<PurchaseQueryResult | null>(null);
  const [listPage, setListPage] = useState(1);
  const [listHasMore, setListHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [afterSaleVisible, setAfterSaleVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Purchase | null>(null);
  const [form] = Form.useForm();
  const [afterSaleForm] = Form.useForm();
  const [items, setItems] = useState<LineItem[]>([newLine()]);
  const buyerPageRef = useRef(1);
  const buyerQueryRef = useRef('');
  const buyerHasMoreRef = useRef(false);
  const buyersLoadingRef = useRef(false);
  const productPageRef = useRef(1);
  const productQueryRef = useRef('');
  const productHasMoreRef = useRef(false);
  const productsLoadingRef = useRef(false);

  const loadList = async (f: Filters, p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
      });
      if (f.buyerName.trim()) params.set('buyerName', f.buyerName.trim());
      if (f.brand.trim()) params.set('brand', f.brand.trim());
      if (f.productName.trim()) params.set('productName', f.productName.trim());
      if (f.dateRange?.[0]) {
        const start = dayjs(f.dateRange[0]);
        if (start.isValid()) params.set('startDate', start.format('YYYY-MM-DD'));
      }
      if (f.dateRange?.[1]) {
        const end = dayjs(f.dateRange[1]);
        if (end.isValid()) params.set('endDate', end.format('YYYY-MM-DD'));
      }
      const data = await api.get<PurchaseQueryResult>(`/sales-orders?${params}`);
      setResult(data);
      setListHasMore(data.hasMore);
      setListPage(p);
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const loadBuyerOptions = useCallback(async (q: string, page: number, append: boolean) => {
    if (buyersLoadingRef.current) return;
    buyersLoadingRef.current = true;
    setBuyersLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (q.trim()) params.set('q', q.trim());
      const res = await api.get<PaginatedList<Buyer>>(`/buyers?${params}`);
      buyerPageRef.current = page;
      buyerQueryRef.current = q;
      buyerHasMoreRef.current = res.hasMore;
      setBuyerOptions((prev) => (append ? [...prev, ...res.items] : res.items));
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      buyersLoadingRef.current = false;
      setBuyersLoading(false);
    }
  }, []);

  const debouncedBuyerSearch = useMemo(
    () =>
      debounce((value: string) => {
        void loadBuyerOptions(value, 1, false);
      }, 300),
    [loadBuyerOptions],
  );

  useEffect(() => () => debouncedBuyerSearch.cancel(), [debouncedBuyerSearch]);

  const ensureBuyerInOptions = async (buyerId: string) => {
    try {
      const buyer = await api.get<Buyer>(`/buyers/${buyerId}`);
      setBuyerOptions((prev) => (prev.some((b) => b.id === buyer.id) ? prev : [buyer, ...prev]));
    } catch {
      /* ignore */
    }
  };

  const handleBuyerSearch = (value: string) => {
    debouncedBuyerSearch(value);
  };

  const handleBuyerPopupScroll = (elem: HTMLDivElement) => {
    if (buyersLoadingRef.current) return;
    if (elem.scrollTop + elem.clientHeight < elem.scrollHeight - 8) return;
    if (!buyerHasMoreRef.current) return;
    void loadBuyerOptions(buyerQueryRef.current, buyerPageRef.current + 1, true);
  };

  const loadProductOptions = useCallback(async (q: string, page: number, append: boolean) => {
    if (productsLoadingRef.current) return;
    productsLoadingRef.current = true;
    setProductsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PRODUCT_OPTION_PAGE_SIZE),
      });
      if (q.trim()) params.set('q', q.trim());
      const res = await api.get<PaginatedList<ProductModel>>(`/product-models?${params}`);
      productPageRef.current = page;
      productQueryRef.current = q;
      productHasMoreRef.current = res.hasMore;
      setProductOptions((prev) => (append ? [...prev, ...res.items] : res.items));
    } catch (e) {
      Message.error(errMessage(e));
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

  const ensureProductInOptions = async (productId: string) => {
    try {
      const product = await api.get<ProductModel>(`/product-models/${productId}`);
      setProductOptions((prev) =>
        prev.some((p) => p.id === product.id) ? prev : [product, ...prev],
      );
    } catch {
      /* ignore */
    }
  };

  const loadInventoryForProduct = async (lineKeyValue: number, productId: string) => {
    if (inventoryLoading[String(lineKeyValue)]) return;
    setInventoryLoading((prev) => ({ ...prev, [lineKeyValue]: true }));
    try {
      const res = await api.get<PaginatedList<InventoryItem>>(
        `/inventory/items?modelId=${productId}&page=1&pageSize=200`,
      );
      const available = res.items.filter(
        (item) => item.status === 'IN_STOCK' || item.status === 'RETURNED_IN_STOCK',
      );
      setInventoryOptions((prev) => ({ ...prev, [lineKeyValue]: available }));
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setInventoryLoading((prev) => ({ ...prev, [lineKeyValue]: false }));
    }
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

  const prepareAddModal = async (opts?: { buyerId?: string; productIds?: string[] }) => {
    await Promise.all([loadBuyerOptions('', 1, false), loadProductOptions('', 1, false)]);
    if (opts?.buyerId) await ensureBuyerInOptions(opts.buyerId);
    const ids = [...new Set((opts?.productIds ?? []).filter(Boolean))] as string[];
    await Promise.all(ids.map((id) => ensureProductInOptions(id)));
  };

  useEffect(() => {
    api.get<Brand[]>('/brands').then(setBrands).catch(() => {});
    void loadList(emptyFilters, 1);
  }, []);

  const normalizeFilters = (f: Filters): Filters => ({
    ...f,
    dateRange:
      f.dateRange?.[0] && f.dateRange?.[1]
        ? [dayjs(f.dateRange[0]), dayjs(f.dateRange[1])]
        : undefined,
  });

  const applySearch = () => {
    const next = normalizeFilters(filters);
    setAppliedFilters(next);
    void loadList(next, 1);
  };

  const resetFilters = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    void loadList(emptyFilters, 1);
  };

  const tableRows = result?.items ?? [];

  const openAdd = () => {
    form.resetFields();
    form.setFieldsValue({ purchasedAt: dayjs() });
    setItems([newLine()]);
    setInventoryOptions({});
    setAddVisible(true);
    void prepareAddModal();
  };

  const loadOrderDetail = async (purchaseId: string) => {
    const detail = await api.get<Purchase>(`/sales-orders/${purchaseId}`);
    setSelectedOrder(detail);
    setDetailVisible(true);
  };

  const openDetail = (purchase: Purchase) => {
    void loadOrderDetail(purchase.id).catch((e) => Message.error(errMessage(e)));
  };

  const openAfterSale = (purchase: Purchase) => {
    const eligibleItemIds = purchase.items.filter(isOrderItemEligibleForAfterSale).map((item) => item.id);
    if (!eligibleItemIds.length) {
      Message.error('该订单没有可继续售后的明细');
      return;
    }
    setSelectedOrder(purchase);
    setDetailVisible(false);
    afterSaleForm.resetFields();
    afterSaleForm.setFieldsValue({
      salesOrderItemIds: eligibleItemIds,
      type: 'RETURN',
      note: '',
    });
    setAfterSaleVisible(true);
  };

  const formatAfterSaleItems = (afterSale: NonNullable<Purchase['afterSales']>[number]) => {
    const ids = new Set((afterSale.items ?? []).map((item) => item.salesOrderItemId));
    const names = selectedOrder?.items
      .filter((item) => ids.has(item.id))
      .map((item) => item.name)
      .filter(Boolean) ?? [];
    return names.length ? names.join('、') : '-';
  };

  const copyPurchaseToDialog = (purchase: Purchase) => {
    form.resetFields();
    form.setFieldsValue({
      buyerId: purchase.buyerId,
      purchasedAt: dayjs(purchase.purchasedAt),
      note: purchase.note || '',
    });
    setItems(
      purchase.items.length
        ? purchase.items.map((item) => ({
            key: ++lineKey,
            productId: item.modelId ?? item.productId,
            inventoryItemId: item.inventoryItemId ?? null,
            name: item.name,
            price: String(item.price),
            quantity: item.quantity,
          }))
        : [newLine()],
    );
    setAddVisible(true);
    void prepareAddModal({
      buyerId: purchase.buyerId,
      productIds: purchase.items
        .map((item) => item.modelId ?? item.productId)
        .filter((id): id is string => Boolean(id)),
    });
  };

  const removePurchase = (purchase: Purchase) => {
    const buyerName = purchase.buyer?.name ?? '-';
    const time = new Date(purchase.purchasedAt).toLocaleString('zh-CN');
    confirmDelete({
      title: '删除消费',
      content: `确定删除 ${buyerName} 在 ${time} 的整笔消费？将删除全部 ${purchase.items.length} 条明细并恢复库存。`,
      onDelete: () => api.delete(`/sales-orders/${purchase.id}`),
      onSuccess: () => void loadList(appliedFilters, listPage),
    });
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

  const submitPurchase = async () => {
    try {
      const values = await form.validate();
      if (!values.buyerId) {
        Message.error('请选择购买者');
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
          Message.error('请填写价格');
          return;
        }
      }
      await api.post('/sales-orders', {
        buyerId: values.buyerId,
        purchasedAt: dayjs(values.purchasedAt).toISOString(),
        note: values.note || null,
        items: items.map(({ productId, inventoryItemId, name, price, quantity }) => ({
          modelId: productId || null,
          inventoryItemId: inventoryItemId || null,
          name,
          price,
          quantity,
        })),
      });
      Message.success('消费记录已保存');
      setAddVisible(false);
      void loadList(appliedFilters, listPage);
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    }
  };

  const submitAfterSale = async () => {
    try {
      const values = await afterSaleForm.validate();
      if (!selectedOrder) {
        Message.error('未找到原订单');
        return;
      }
      const itemIds = (values.salesOrderItemIds ?? []) as string[];
      if (!itemIds.length) {
        Message.error('请选择至少一条明细');
        return;
      }
      const eligibleIds = new Set(
        selectedOrder.items.filter(isOrderItemEligibleForAfterSale).map((item) => item.id),
      );
      if (itemIds.some((id) => !eligibleIds.has(id))) {
        Message.error('已售后明细不能重复发起售后');
        return;
      }
      await api.post('/after-sales', {
        salesOrderId: selectedOrder.id,
        type: values.type,
        note: values.note || null,
        items: itemIds.map((salesOrderItemId) => ({ salesOrderItemId })),
      });
      Message.success('售后单已创建');
      setAfterSaleVisible(false);
      void loadList(appliedFilters, listPage);
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    }
  };

  return (
    <>
      <h1 className="page-title">订单列表</h1>
      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
          <Statistic
            title="筛选后累计金额"
            value={result?.grandTotal ?? 0}
            precision={2}
            prefix="¥"
          />
          <Statistic title="商品明细条数" value={result?.itemCount ?? 0} />
          <Statistic title="订单数" value={result?.purchaseCount ?? 0} />
        </Space>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: 12,
          }}
        >
          <Space wrap align="end">
            <Input
              style={{ width: 140 }}
              placeholder="购买者姓名"
              value={filters.buyerName}
              onChange={(v) => setFilters((f) => ({ ...f, buyerName: v }))}
              allowClear
            />
            <Select
              style={{ width: 140 }}
              placeholder="品牌"
              allowClear
              showSearch
              value={filters.brand || undefined}
              onChange={(v) => setFilters((f) => ({ ...f, brand: v || '' }))}
              filterOption={(inputValue, option) =>
                String(option?.props?.children ?? '')
                  .toLowerCase()
                  .includes(inputValue.trim().toLowerCase())
              }
            >
              {brands.map((b) => (
                <Select.Option key={b.id} value={b.name}>
                  {b.name}
                </Select.Option>
              ))}
            </Select>
            <Input
              style={{ width: 160 }}
              placeholder="商品名称"
              value={filters.productName}
              onChange={(v) => setFilters((f) => ({ ...f, productName: v }))}
              allowClear
            />
            <DatePicker.RangePicker
              style={{ width: 260 }}
              format="YYYY-MM-DD"
              value={filters.dateRange}
              onChange={(dates) =>
                setFilters((f) => ({
                  ...f,
                  dateRange:
                    dates?.[0] && dates?.[1]
                      ? [dayjs(dates[0]), dayjs(dates[1])]
                      : undefined,
                }))
              }
              placeholder={['开始日期', '结束日期']}
              allowClear
            />
            <Button type="primary" onClick={applySearch}>
              筛选
            </Button>
            <Button onClick={resetFilters}>重置</Button>
            <Button icon={<IconRefresh />} onClick={() => void loadList(appliedFilters, listPage)}>
              刷新
            </Button>
          </Space>
          <Button
            type="primary"
            icon={<IconPlus />}
            onClick={openAdd}
            style={{ marginLeft: 'auto' }}
          >
            添加消费
          </Button>
        </div>
      </Card>

      <Table
        loading={loading}
        rowKey="id"
        data={tableRows}
        pagination={{
          current: listPage,
          pageSize: PAGE_SIZE,
          total: paginationTotal(listPage, PAGE_SIZE, result?.items.length ?? 0, listHasMore),
          showTotal: true,
          onChange: (p) => void loadList(appliedFilters, p),
        }}
        columns={[
          { title: '购买者', render: (_, row) => row.buyer?.name ?? '-' },
          { title: '手机', render: (_, row) => row.buyer?.phone ?? '-' },
          {
            title: '购买时间',
            render: (_, row) => new Date(row.purchasedAt).toLocaleString('zh-CN'),
          },
          {
            title: '售后状态',
            render: (_, row) => {
              const state = getOrderAfterSaleState(row);
              return <Tag color={state.color}>{state.label}</Tag>;
            },
          },
          {
            title: '商品明细',
            render: (_, row) => (
              <Typography.Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 280, marginBottom: 0 }}>
                {summarizeOrderItems(row)}
              </Typography.Text>
            ),
          },
          {
            title: '合计',
            render: (_, row) => <span className="cell-nowrap">{formatMoney(orderTotal(row))}</span>,
          },
          {
            title: '商品数量',
            render: (_, row) => row.items.length,
          },
          {
            title: '备注',
            render: (_, row) =>
              row.note ? (
                <Typography.Text
                  ellipsis={{ showTooltip: true }}
                  style={{ maxWidth: 180, marginBottom: 0 }}
                >
                  {row.note}
                </Typography.Text>
              ) : (
                '-'
              ),
          },
          {
            title: '操作',
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => openDetail(row)}>
                  查看详情
                </Button>
                <Button size="small" onClick={() => copyPurchaseToDialog(row)}>
                  复制
                </Button>
                <Button size="small" onClick={() => openAfterSale(row)}>
                  售后
                </Button>
                <Button size="small" status="danger" onClick={() => removePurchase(row)}>
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="添加消费"
        visible={addVisible}
        onOk={submitPurchase}
        onCancel={() => setAddVisible(false)}
        style={{ width: 720 }}
        unmountOnExit
      >
        <Form form={form} layout="vertical">
          <Form.Item label="购买者" field="buyerId" rules={[{ required: true }]}>
            <Select
              placeholder="输入姓名搜索"
              showSearch
              allowClear
              loading={buyersLoading}
              filterOption={false}
              onSearch={handleBuyerSearch}
              onPopupScroll={handleBuyerPopupScroll}
            >
              {buyerOptions.map((b) => (
                <Select.Option key={b.id} value={b.id}>
                  {b.phone ? `${b.name}（${b.phone}）` : b.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="购买时间"
            field="purchasedAt"
            rules={[{ required: true, message: '请选择购买时间' }]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              placeholder="请选择购买时间"
            />
          </Form.Item>
          <Form.Item
            label="备注"
            field="note"
            rules={[{ maxLength: 500, message: '备注最多 500 个字符' }]}
          >
            <Input.TextArea rows={2} maxLength={500} showWordLimit placeholder="选填" />
          </Form.Item>
        </Form>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>商品明细</div>
        {items.map((row) => (
          <Card key={row.key} size="small" style={{ marginBottom: 8 }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 12,
              }}
            >
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
              )}
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>名称</div>
                <Input style={{ width: 160 }} value={row.name} disabled />
              </div>
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

      <Modal
        title="消费详情"
        visible={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={
          <Space>
            <Button onClick={() => setDetailVisible(false)}>关闭</Button>
            <Button
              type="primary"
              onClick={() => {
                if (selectedOrder) openAfterSale(selectedOrder);
              }}
            >
              发起售后
            </Button>
          </Space>
        }
        unmountOnExit
        style={{ width: 840 }}
      >
        {selectedOrder ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Card size="small">
              <Space direction="vertical" size={4}>
                <div>
                  购买者：{selectedOrder.buyer?.name ?? '-'}
                  {selectedOrder.buyer?.phone ? ` / ${selectedOrder.buyer.phone}` : ''}
                </div>
                <div>购买时间：{new Date(selectedOrder.purchasedAt).toLocaleString('zh-CN')}</div>
                <div>备注：{selectedOrder.note || '-'}</div>
                <div>合计：{formatMoney(orderTotal(selectedOrder))}</div>
              </Space>
            </Card>
            <Card title="售后记录" size="small">
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {(selectedOrder.afterSales ?? []).length ? (
                  (selectedOrder.afterSales ?? []).map((afterSale) => {
                    const state = afterSaleStatusLabel(afterSale.status);
                    return (
                      <Card key={afterSale.id} size="small">
                        <Space direction="vertical" size={4}>
                          <div>
                            售后单号：{afterSale.id} <Tag color="arcoblue">{afterSaleTypeLabel(afterSale.type)}</Tag>{' '}
                            <Tag color={state.color}>{state.label}</Tag>
                          </div>
                          <div>涉及商品：{formatAfterSaleItems(afterSale)}</div>
                        </Space>
                      </Card>
                    );
                  })
                ) : (
                  <Typography.Text type="secondary">暂无售后记录</Typography.Text>
                )}
              </Space>
            </Card>
            <Table
              rowKey="id"
              data={selectedOrder.items}
              pagination={false}
              columns={[
                { title: '商品名称', dataIndex: 'name' },
                {
                  title: '售后状态',
                  render: (_, item) => {
                    const status = item.status ?? 'SOLD';
                    if (status === 'RETURNED' || status === 'EXCHANGED') return <Tag color="green">已售后</Tag>;
                    if (status === 'EXCHANGING') return <Tag color="orange">售后中</Tag>;
                    return <Tag color="gray">未售后</Tag>;
                  },
                },
                {
                  title: '品牌',
                  render: (_, item) => item.model?.brand?.name ?? item.product?.brand?.name ?? '-',
                },
                {
                  title: '型号',
                  render: (_, item) => item.model?.name ?? item.product?.name ?? '-',
                },
                {
                  title: '卖价',
                  dataIndex: 'price',
                  render: (v) => <span className="cell-nowrap">{formatMoney(v)}</span>,
                },
                { title: '数量', dataIndex: 'quantity' },
                {
                  title: '小计',
                  render: (_, item) => (
                    <span className="cell-nowrap">{formatMoney(lineTotal(item.price, item.quantity))}</span>
                  ),
                },
                {
                  title: '库存单品',
                  render: (_, item) =>
                    item.inventoryItem ? (
                      item.inventoryItem.imei || item.inventoryItem.imei2 || item.inventoryItem.sn || `单品 ${item.inventoryItem.id}`
                    ) : (
                      '-'
                    ),
                },
              ]}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        title="发起售后"
        visible={afterSaleVisible}
        onOk={submitAfterSale}
        onCancel={() => setAfterSaleVisible(false)}
        unmountOnExit
        style={{ width: 760 }}
      >
        <Form form={afterSaleForm} layout="vertical">
          <Form.Item label="售后类型" field="type" rules={[{ required: true }]}>
            <Select placeholder="选择类型">
              <Select.Option value="RETURN">退货</Select.Option>
              <Select.Option value="EXCHANGE">换货</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="商品明细"
            field="salesOrderItemIds"
            rules={[{ required: true, message: '请选择至少一条明细' }]}
          >
            <Select mode="multiple" allowClear placeholder="可多选明细">
              {selectedOrder?.items.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {`${item.name} × ${item.quantity}`}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="备注" field="note">
            <Input.TextArea rows={2} maxLength={500} showWordLimit placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
