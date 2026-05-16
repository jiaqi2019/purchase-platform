import { useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Message,
  Modal,
  Select,
  Space,
  Table,
} from '@arco-design/web-react';
import { api, errMessage } from '../api/http-client';
import { confirmDelete } from '../utils/confirm-delete';
import type { Brand, Id, Product, ProductCategory } from '../types/api-types';
import { formatMoney, toInputNumber } from '../utils/format';

export default function ProductsPage() {
  const [list, setList] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCategoryId, setFilterCategoryId] = useState<string>();
  const [searchQ, setSearchQ] = useState('');
  const [visible, setVisible] = useState(false);
  const [editId, setEditId] = useState<Id | null>(null);
  const [form] = Form.useForm();

  const categoryId = Form.useWatch('categoryId', form);

  const loadProducts = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterCategoryId) params.set('categoryId', filterCategoryId);
    if (searchQ.trim()) params.set('q', searchQ.trim());
    const qs = params.toString();
    try {
      setList(await api.get<Product[]>(`/products${qs ? `?${qs}` : ''}`));
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get<ProductCategory[]>('/product-categories').then(setCategories).catch(() => {});
    api.get<Brand[]>('/brands').then(setBrands).catch(() => {});
    loadProducts();
  }, []);

  useEffect(() => {
    loadProducts();
  }, [filterCategoryId, searchQ]);

  const openCreate = () => {
    setEditId(null);
    form.resetFields();
    form.setFieldsValue({ stock: 0 });
    setVisible(true);
  };

  const openEdit = (p: Product) => {
    setEditId(p.id);
    form.setFieldsValue({
      categoryId: p.categoryId,
      brandId: p.brandId || undefined,
      name: p.name,
      costPrice: toInputNumber(p.costPrice),
      sellPrice: toInputNumber(p.sellPrice),
      stock: p.stock,
    });
    setVisible(true);
  };

  const submit = async () => {
    try {
      const values = await form.validate();
      if (!values.brandId) {
        Message.error('请选择品牌');
        return;
      }
      const body = {
        categoryId: values.categoryId,
        brandId: values.brandId,
        name: values.name,
        costPrice: values.costPrice === '' || values.costPrice === undefined ? null : values.costPrice,
        sellPrice: values.sellPrice === '' || values.sellPrice === undefined ? null : values.sellPrice,
        stock: values.stock ?? 0,
      };
      if (editId) await api.patch(`/products/${editId}`, body);
      else await api.post('/products', body);
      Message.success(editId ? '已更新' : '已创建');
      setVisible(false);
      loadProducts();
    } catch (e) {
      if (e && typeof e === 'object' && 'error' in e) return;
      Message.error(errMessage(e));
    }
  };

  const filteredBrands = categoryId
    ? brands.filter((b) => !b.categoryId || b.categoryId === categoryId)
    : brands;

  return (
    <>
      <h1 className="page-title">商品入库</h1>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" onClick={openCreate}>
          新建商品
        </Button>
        <Select
          style={{ width: 160 }}
          placeholder="筛选分类"
          allowClear
          value={filterCategoryId}
          onChange={setFilterCategoryId}
        >
          {categories.map((c) => (
            <Select.Option key={c.id} value={c.id}>
              {c.name}
            </Select.Option>
          ))}
        </Select>
        <Input.Search
          style={{ width: 220 }}
          placeholder="名称/品牌"
          allowClear
          onSearch={setSearchQ}
        />
      </Space>
      <Table
        loading={loading}
        rowKey="id"
        data={list}
        columns={[
          { title: '分类', render: (_, r) => r.category?.name },
          { title: '品牌', render: (_, r) => r.brand?.name || '-' },
          { title: '名称', dataIndex: 'name' },
          { title: '成本价', dataIndex: 'costPrice', render: formatMoney },
          { title: '售卖价', dataIndex: 'sellPrice', render: formatMoney },
          { title: '库存', dataIndex: 'stock' },
          {
            title: '操作',
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Button
                  size="small"
                  status="danger"
                  onClick={() =>
                    confirmDelete({
                      onDelete: () => api.delete(`/products/${row.id}`),
                      onSuccess: loadProducts,
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
      <Modal
        title={editId ? '编辑商品' : '新建商品'}
        visible={visible}
        onOk={submit}
        onCancel={() => setVisible(false)}
        style={{ width: 520 }}
        unmountOnExit
      >
        <Form form={form} layout="vertical">
          <Form.Item label="分类" field="categoryId" rules={[{ required: true }]}>
            <Select onChange={() => form.setFieldsValue({ brandId: undefined })}>
              {categories.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="品牌" field="brandId" rules={[{ required: true, message: '请选择品牌' }]}>
            <Select placeholder="请选择品牌">
              {filteredBrands.map((b) => (
                <Select.Option key={b.id} value={b.id}>
                  {b.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="名称" field="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="成本价（可选）" field="costPrice">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="售卖价（可选）" field="sellPrice">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="库存" field="stock">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
