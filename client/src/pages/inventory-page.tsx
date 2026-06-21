import { useEffect, useState } from 'react';
import { Button, Card, Input, Message, Select, Space, Table, Tabs, Tag } from '@arco-design/web-react';
import { api, errMessage } from '../api/http-client';
import type {
  Brand,
  InventoryItem,
  PaginatedList,
  ProductCategory,
  ProductModel,
} from '../types/api-types';
import { PAGE_SIZE, paginationTotal } from '../utils/pagination';

type BatchRow = {
  id: string;
  quantityOnHand: number;
  costPrice: string | number | null;
  model?: ProductModel;
  attributes?: Record<string, unknown> | null;
};

const STATUS_LABELS: Record<string, string> = {
  IN_STOCK: '在库',
  SOLD: '已售出',
  OUT_OF_STOCK: '已出库',
  RETURNED_IN_STOCK: '退回在库',
  EXCHANGING: '换货中',
  REPAIR_RESERVED: '维修占用',
  SCRAPPED: '已报废',
};

export default function InventoryPage() {
  const [serializedList, setSerializedList] = useState<InventoryItem[]>([]);
  const [batchList, setBatchList] = useState<BatchRow[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<ProductModel[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [tab, setTab] = useState<'serialized' | 'batch'>('serialized');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>();
  const [categoryId, setCategoryId] = useState<string>();
  const [brandId, setBrandId] = useState<string>();
  const [modelId, setModelId] = useState<string>();

  const load = async (p = 1, nextTab = tab) => {
    const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
    if (q.trim()) params.set('q', q.trim());
    if (status && nextTab === 'serialized') params.set('status', status);
    if (categoryId) params.set('categoryId', categoryId);
    if (brandId) params.set('brandId', brandId);
    if (modelId) params.set('modelId', modelId);
    if (nextTab === 'serialized') {
      const res = await api.get<PaginatedList<InventoryItem>>(`/inventory/items?${params}`);
      setSerializedList(res.items);
      setHasMore(res.hasMore);
    } else {
      const res = await api.get<PaginatedList<BatchRow>>(`/inventory/batches?${params}`);
      setBatchList(res.items);
      setHasMore(res.hasMore);
    }
    setPage(p);
  };

  useEffect(() => {
    void load(1).catch((e) => Message.error(errMessage(e)));
  }, [tab, status, categoryId, brandId, modelId]);

  useEffect(() => {
    api.get<ProductCategory[]>('/product-categories').then(setCategories).catch(() => {});
    api.get<Brand[]>('/brands').then(setBrands).catch(() => {});
    api
      .get<PaginatedList<ProductModel>>('/product-models?page=1&pageSize=500')
      .then((res) => setModels(res.items))
      .catch(() => {});
  }, []);

  const filteredBrands = categoryId
    ? brands.filter((brand) => !brand.categoryId || brand.categoryId === categoryId)
    : brands;
  const filteredModels = models.filter((model) => {
    if (categoryId && model.categoryId !== categoryId) return false;
    if (brandId && model.brandId !== brandId) return false;
    return true;
  });

  const resetFilters = () => {
    setCategoryId(undefined);
    setBrandId(undefined);
    setModelId(undefined);
    setStatus(undefined);
    setQ('');
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="page-title">库存查询</h1>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            style={{ width: 160 }}
            placeholder="品类"
            allowClear
            value={categoryId}
            onChange={(value) => {
              setCategoryId(value);
              setBrandId(undefined);
              setModelId(undefined);
            }}
          >
            {categories.map((category) => (
              <Select.Option key={category.id} value={category.id}>{category.name}</Select.Option>
            ))}
          </Select>
          <Select
            style={{ width: 160 }}
            placeholder="品牌"
            allowClear
            value={brandId}
            onChange={(value) => {
              setBrandId(value);
              setModelId(undefined);
            }}
          >
            {filteredBrands.map((brand) => (
              <Select.Option key={brand.id} value={brand.id}>{brand.name}</Select.Option>
            ))}
          </Select>
          <Select
            style={{ width: 200 }}
            placeholder="型号"
            allowClear
            showSearch
            value={modelId}
            onChange={setModelId}
            filterOption={(input, option) =>
              String(option?.props?.children ?? '').toLowerCase().includes(input.toLowerCase())
            }
          >
            {filteredModels.map((model) => (
              <Select.Option key={model.id} value={model.id}>{model.name}</Select.Option>
            ))}
          </Select>
          <Input.Search
            style={{ width: 220 }}
            placeholder="IMEI / SN / 型号"
            allowClear
            value={q}
            onChange={setQ}
            onSearch={() => void load(1)}
          />
          {tab === 'serialized' && (
            <Select
              style={{ width: 140 }}
              placeholder="状态"
              allowClear
              value={status}
              onChange={setStatus}
            >
              <Select.Option value="IN_STOCK">在库</Select.Option>
              <Select.Option value="SOLD">已售出</Select.Option>
              <Select.Option value="RETURNED_IN_STOCK">退回在库</Select.Option>
              <Select.Option value="EXCHANGING">换货中</Select.Option>
              <Select.Option value="REPAIR_RESERVED">维修占用</Select.Option>
              <Select.Option value="OUT_OF_STOCK">已出库</Select.Option>
              <Select.Option value="SCRAPPED">已报废</Select.Option>
            </Select>
          )}
          <Button onClick={resetFilters}>重置</Button>
        </Space>
      </Card>
      <Tabs activeTab={tab} onChange={(key) => setTab(key as 'serialized' | 'batch')}>
        <Tabs.TabPane key="serialized" title="单品查询">
          <Table
            rowKey="id"
            data={serializedList}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: paginationTotal(page, PAGE_SIZE, serializedList.length, hasMore),
              onChange: (p) => void load(p, 'serialized'),
            }}
            columns={[
              { title: '品类', render: (_, r) => r.model?.category?.name ?? '-' },
              { title: '品牌', render: (_, r) => r.model?.brand?.name ?? '-' },
              { title: '型号', render: (_, r) => r.model?.name ?? '-' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (v) => <Tag color={v === 'SOLD' ? 'red' : 'blue'}>{STATUS_LABELS[String(v)] ?? String(v)}</Tag>,
              },
              { title: 'IMEI', dataIndex: 'imei', render: (v) => v || '-' },
              { title: 'IMEI2', dataIndex: 'imei2', render: (v) => v || '-' },
              { title: 'SN', dataIndex: 'sn', render: (v) => v || '-' },
            ]}
          />
        </Tabs.TabPane>
        <Tabs.TabPane key="batch" title="数量查询">
          <Table
            rowKey="id"
            data={batchList}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: paginationTotal(page, PAGE_SIZE, batchList.length, hasMore),
              onChange: (p) => void load(p, 'batch'),
            }}
            columns={[
              { title: '品类', render: (_, r) => r.model?.category?.name ?? '-' },
              { title: '品牌', render: (_, r) => r.model?.brand?.name ?? '-' },
              { title: '型号', render: (_, r) => r.model?.name ?? '-' },
              { title: '数量', dataIndex: 'quantityOnHand' },
              { title: '成本价', dataIndex: 'costPrice', render: (v) => (v == null ? '-' : String(v)) },
              {
                title: '属性',
                render: (_, r) =>
                  r.attributes
                    ? Object.entries(r.attributes)
                        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('、') : String(v)}`)
                        .join('；')
                    : '-',
              },
            ]}
          />
        </Tabs.TabPane>
      </Tabs>
    </>
  );
}
