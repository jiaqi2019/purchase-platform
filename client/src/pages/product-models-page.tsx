import { useEffect, useState } from 'react';
import { Button, Card, Input, Message, Select, Space, Table } from '@arco-design/web-react';
import { useNavigate } from 'react-router-dom';
import { api, errMessage } from '../api/http-client';
import { confirmDelete } from '../utils/confirm-delete';
import type { Brand, PaginatedList, ProductCategory, ProductModel } from '../types/api-types';
import { PAGE_SIZE, paginationTotal } from '../utils/pagination';

function optionText(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join('、') : '';
}

export default function ProductModelsPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<ProductModel[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filterCategoryId, setFilterCategoryId] = useState<string>();
  const [filterBrandId, setFilterBrandId] = useState<string>();
  const [keyword, setKeyword] = useState('');

  const load = async (
    p = 1,
    filters = { categoryId: filterCategoryId, brandId: filterBrandId, q: keyword },
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (filters.categoryId) params.set('categoryId', filters.categoryId);
      if (filters.brandId) params.set('brandId', filters.brandId);
      if (filters.q.trim()) params.set('q', filters.q.trim());
      const res = await api.get<PaginatedList<ProductModel>>(`/product-models?${params}`);
      setList(res.items);
      setHasMore(res.hasMore);
      setPage(p);
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    api.get<ProductCategory[]>('/product-categories').then(setCategories).catch(() => {});
    api.get<Brand[]>('/brands').then(setBrands).catch(() => {});
  }, []);

  const filterBrands = filterCategoryId
    ? brands.filter((brand) => !brand.categoryId || brand.categoryId === filterCategoryId)
    : brands;

  const resetFilters = () => {
    setFilterCategoryId(undefined);
    setFilterBrandId(undefined);
    setKeyword('');
    void load(1, { categoryId: undefined, brandId: undefined, q: '' });
  };

  return (
    <>
      <h1 className="page-title">型号规格</h1>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
          <Space wrap>
            <Select
              style={{ width: 160 }}
              placeholder="品类"
              allowClear
              value={filterCategoryId}
              onChange={(value) => {
                setFilterCategoryId(value);
                setFilterBrandId(undefined);
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
              value={filterBrandId}
              onChange={setFilterBrandId}
            >
              {filterBrands.map((brand) => (
                <Select.Option key={brand.id} value={brand.id}>{brand.name}</Select.Option>
              ))}
            </Select>
            <Input.Search
              style={{ width: 220 }}
              placeholder="型号/品牌"
              value={keyword}
              allowClear
              onChange={setKeyword}
              onSearch={() => void load(1)}
            />
            <Button type="primary" onClick={() => void load(1)}>筛选</Button>
            <Button onClick={resetFilters}>重置</Button>
          </Space>
          <Button type="primary" onClick={() => navigate('/models/new')} style={{ marginLeft: 'auto' }}>新建型号</Button>
        </div>
      </Card>
      <Table
        loading={loading}
        rowKey="id"
        data={list}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: paginationTotal(page, PAGE_SIZE, list.length, hasMore),
          onChange: (p) => void load(p),
        }}
        columns={[
          { title: '品类', render: (_, r) => r.category?.name ?? '-' },
          { title: '品牌', render: (_, r) => r.brand?.name ?? '-' },
          { title: '型号', dataIndex: 'name' },
          { title: '库存方式', render: (_, r) => (r.trackingMode === 'SERIALIZED' ? '单品追踪' : '数量库存') },
          { title: '库存', dataIndex: 'stock' },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            render: (value) => (value ? new Date(value).toLocaleString('zh-CN') : '-'),
          },
          {
            title: '规格',
            render: (_, r) =>
              r.specDefinitions
                ?.map((s) => {
                  const options = optionText(s.options);
                  return options ? `${s.name}(${options})` : s.name;
                })
                .join('、') || '-',
          },
          {
            title: '操作',
            render: (_, row) => (
              <Space>
                <Button
                  size="small"
                  status="danger"
                  onClick={() =>
                    confirmDelete({
                      content: `确定删除型号 ${row.name}？仅未入库、未产生订单记录的型号可删除。`,
                      onDelete: () => api.delete(`/product-models/${row.id}`),
                      onSuccess: () => void load(page),
                    })
                  }
                >
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </>
  );
}
