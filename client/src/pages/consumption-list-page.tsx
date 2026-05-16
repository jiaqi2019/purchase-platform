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
  Typography,
  DatePicker,
} from '@arco-design/web-react';
import dayjs, { type Dayjs } from 'dayjs';
import { IconPlus, IconRefresh } from '@arco-design/web-react/icon';
import { api, errMessage } from '../api/http-client';
import type {
  Brand,
  Buyer,
  PaginatedList,
  Product,
  Purchase,
  PurchaseQueryResult,
} from '../types/api-types';
import { formatMoney } from '../utils/format';
import { PAGE_SIZE, paginationTotal } from '../utils/pagination';
import { confirmDelete } from '../utils/confirm-delete';

interface LineItem {
  key: number;
  productId?: string | null;
  name: string;
  price: string;
  quantity: number;
}

interface ConsumptionRow {
  rowKey: string;
  purchaseId: string;
  itemId: string;
  buyerName: string;
  buyerPhone: string;
  purchasedAt: string;
  note: string | null;
  itemName: string;
  brandName: string;
  price: string | number;
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
  name: '',
  price: '',
  quantity: 1,
});

function flattenPurchases(purchases: Purchase[]): ConsumptionRow[] {
  const rows: ConsumptionRow[] = [];
  for (const p of purchases) {
    for (const item of p.items) {
      rows.push({
        rowKey: `${p.id}-${item.id}`,
        purchaseId: p.id,
        itemId: item.id,
        buyerName: p.buyer?.name ?? '-',
        buyerPhone: p.buyer?.phone ?? '-',
        purchasedAt: p.purchasedAt,
        note: p.note,
        itemName: item.name,
        brandName: item.product?.brand?.name ?? '-',
        price: item.price,
        quantity: item.quantity,
      });
    }
  }
  return rows;
}

function lineTotal(price: string | number, qty: number): number {
  return Number(price) * qty;
}

function formatProductOptionLabel(p: Product): string {
  const brand = p.brand?.name ?? '-';
  return `${brand}-${p.name}（${p.stock}）`;
}

export default function ConsumptionListPage() {
  const [buyerOptions, setBuyerOptions] = useState<Buyer[]>([]);
  const [buyersLoading, setBuyersLoading] = useState(false);
  const [productOptions, setProductOptions] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [result, setResult] = useState<PurchaseQueryResult | null>(null);
  const [listPage, setListPage] = useState(1);
  const [listHasMore, setListHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [form] = Form.useForm();
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
      const data = await api.get<PurchaseQueryResult>(`/purchases?${params}`);
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
      /* 已选购买者不在当前分页结果中时单独拉取 */
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
      const res = await api.get<PaginatedList<Product>>(`/products?${params}`);
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
      const product = await api.get<Product>(`/products/${productId}`);
      setProductOptions((prev) =>
        prev.some((p) => p.id === product.id) ? prev : [product, ...prev],
      );
    } catch {
      /* 已选商品不在当前分页结果中时单独拉取 */
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

  const tableRows = result ? flattenPurchases(result.items) : [];

  const purchaseMap = new Map<string, Purchase>();
  for (const p of result?.items ?? []) {
    purchaseMap.set(p.id, p);
  }

  const openAdd = () => {
    form.resetFields();
    form.setFieldsValue({ purchasedAt: dayjs() });
    setItems([newLine()]);
    setAddVisible(true);
    void prepareAddModal();
  };

  const copyRowToDialog = (row: ConsumptionRow) => {
    const purchase = purchaseMap.get(row.purchaseId);
    if (!purchase) {
      Message.error('未找到消费记录');
      return;
    }
    const item = purchase.items.find((i) => i.id === row.itemId);
    if (!item) {
      Message.error('未找到商品明细');
      return;
    }
    form.resetFields();
    form.setFieldsValue({
      buyerId: purchase.buyerId,
      purchasedAt: dayjs(purchase.purchasedAt),
      note: purchase.note || '',
    });
    setItems([
      {
        key: ++lineKey,
        productId: item.productId,
        name: item.name,
        price: String(item.price),
        quantity: item.quantity,
      },
    ]);
    setAddVisible(true);
    void prepareAddModal({
      buyerId: purchase.buyerId,
      productIds: [item.productId].filter((id): id is string => Boolean(id)),
    });
  };

  const removePurchase = (row: ConsumptionRow) => {
    const purchase = purchaseMap.get(row.purchaseId);
    const buyerName = purchase?.buyer?.name ?? row.buyerName;
    const time = new Date(row.purchasedAt).toLocaleString('zh-CN');
    confirmDelete({
      title: '删除消费',
      content: `确定删除 ${buyerName} 在 ${time} 的整笔消费？将删除全部 ${purchase?.items.length ?? 0} 条明细并恢复库存。`,
      onDelete: () => api.delete(`/purchases/${row.purchaseId}`),
      onSuccess: () => void loadList(appliedFilters, listPage),
    });
  };

  const pickProduct = (key: number, productId: string) => {
    const p = productOptions.find((x) => x.id === productId);
    const price = p?.sellPrice != null ? String(p.sellPrice) : '';
    setItems((rows) =>
      rows.map((row) =>
        row.key === key
          ? {
              ...row,
              productId: productId || null,
              name: p ? p.name : row.name,
              price: price || row.price,
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
        if (row.price === '' || row.price === undefined) {
          Message.error('请填写价格');
          return;
        }
      }
      await api.post('/purchases', {
        buyerId: values.buyerId,
        purchasedAt: dayjs(values.purchasedAt).toISOString(),
        note: values.note || null,
        items: items.map(({ productId, name, price, quantity }) => ({
          productId: productId || null,
          name,
          price,
          sellPrice: null,
          quantity,
        })),
      });
      Message.success('消费记录已保存');
      setAddVisible(false);
      void loadList(appliedFilters, listPage);
    } catch (e) {
      if (e && typeof e === 'object' && 'error' in e) return;
      Message.error(errMessage(e));
    }
  };

  return (
    <>
      <h1 className="page-title">消费列表</h1>
      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
          <Statistic
            title="筛选后累计消费"
            value={result?.grandTotal ?? 0}
            precision={2}
            prefix="¥"
          />
          <Statistic title="消费明细条数" value={result?.itemCount ?? 0} />
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
        rowKey="rowKey"
        data={tableRows}
        pagination={{
          current: listPage,
          pageSize: PAGE_SIZE,
          total: paginationTotal(listPage, PAGE_SIZE, result?.items.length ?? 0, listHasMore),
          showTotal: true,
          onChange: (p) => void loadList(appliedFilters, p),
        }}
        columns={[
          { title: '购买者', dataIndex: 'buyerName' },
          { title: '手机', dataIndex: 'buyerPhone' },
          {
            title: '购买时间',
            dataIndex: 'purchasedAt',
            render: (v) => new Date(v).toLocaleString('zh-CN'),
          },
          { title: '商品名称', dataIndex: 'itemName' },
          { title: '品牌', dataIndex: 'brandName' },
          {
            title: '价格',
            dataIndex: 'price',
            render: (v) => <span className="cell-nowrap">{formatMoney(v)}</span>,
          },
          { title: '数量', dataIndex: 'quantity' },
          {
            title: '小计',
            render: (_, row) => (
              <span className="cell-nowrap">{formatMoney(lineTotal(row.price, row.quantity))}</span>
            ),
          },
          {
            title: '备注',
            dataIndex: 'note',
            render: (v) =>
              v ? (
                <Typography.Text
                  ellipsis={{ showTooltip: true }}
                  style={{ maxWidth: 180, marginBottom: 0 }}
                >
                  {v}
                </Typography.Text>
              ) : (
                '-'
              ),
          },
          {
            title: '操作',
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => copyRowToDialog(row)}>
                  复制
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
              <div>
                <div style={{ marginBottom: 4, color: 'var(--color-text-3)' }}>名称</div>
                <Input
                  style={{ width: 160 }}
                  value={row.name}
                  onChange={(v) =>
                    setItems((rows) =>
                      rows.map((r) => (r.key === row.key ? { ...r, name: v } : r)),
                    )
                  }
                />
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
                  onChange={(v) =>
                    setItems((rows) =>
                      rows.map((r) =>
                        r.key === row.key ? { ...r, quantity: v ?? 1 } : r,
                      ),
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
