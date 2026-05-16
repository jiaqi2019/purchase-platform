import { useEffect, useState } from 'react';
import { Button, Form, Input, Message, Modal, Select, Space, Table } from '@arco-design/web-react';
import { api, errMessage } from '../api/http-client';
import { confirmDelete } from '../utils/confirm-delete';
import type { Brand, Id, ProductCategory } from '../types/api-types';

export default function BrandsPage() {
  const [list, setList] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editId, setEditId] = useState<Id | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setList(await api.get<Brand[]>('/brands'));
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.get<ProductCategory[]>('/product-categories').then(setCategories).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditId(null);
    form.resetFields();
    setVisible(true);
  };

  const openEdit = (b: Brand) => {
    setEditId(b.id);
    form.setFieldsValue({ name: b.name, categoryId: b.categoryId || undefined });
    setVisible(true);
  };

  const submit = async () => {
    try {
      const values = await form.validate();
      const body = { name: values.name, categoryId: values.categoryId || null };
      if (editId) await api.patch(`/brands/${editId}`, body);
      else await api.post('/brands', body);
      Message.success(editId ? '已更新' : '已创建');
      setVisible(false);
      load();
    } catch (e) {
      if (e && typeof e === 'object' && 'error' in e) return;
      Message.error(errMessage(e));
    }
  };

  return (
    <>
      <h1 className="page-title">品牌</h1>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>
          新建品牌
        </Button>
      </Space>
      <Table
        loading={loading}
        rowKey="id"
        data={list}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '关联分类', render: (_, r) => r.category?.name || '-' },
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
                      onDelete: () => api.delete(`/brands/${row.id}`),
                      onSuccess: load,
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
        title={editId ? '编辑品牌' : '新建品牌'}
        visible={visible}
        onOk={submit}
        onCancel={() => setVisible(false)}
        unmountOnExit
      >
        <Form form={form} layout="vertical">
          <Form.Item label="名称" field="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="关联分类" field="categoryId">
            <Select allowClear placeholder="不限制">
              {categories.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
