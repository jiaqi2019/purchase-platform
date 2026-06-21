import { useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Message,
  Modal,
  Space,
  Table,
  Typography,
} from '@arco-design/web-react';
import { api, errMessage, isFormValidationError } from '../api/http-client';
import { confirmDelete } from '../utils/confirm-delete';
import type { Id, ProductCategory } from '../types/api-types';

export default function CategoriesPage() {
  const [list, setList] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editId, setEditId] = useState<Id | null>(null);
  const [editingCode, setEditingCode] = useState('');
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setList(await api.get<ProductCategory[]>('/product-categories'));
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditId(null);
    setEditingCode('');
    form.resetFields();
    form.setFieldsValue({ sortOrder: 0 });
    setVisible(true);
  };

  const openEdit = (c: ProductCategory) => {
    setEditId(c.id);
    setEditingCode(c.code);
    form.setFieldsValue({ name: c.name, sortOrder: c.sortOrder });
    setVisible(true);
  };

  const submit = async () => {
    try {
      const values = await form.validate();
      const body = { name: values.name, sortOrder: values.sortOrder };
      if (editId) await api.patch(`/product-categories/${editId}`, body);
      else await api.post('/product-categories', body);
      Message.success(editId ? '已更新' : '已创建');
      setVisible(false);
      load();
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    }
  };

  return (
    <>
      <h1 className="page-title">商品分类</h1>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>
          新建分类
        </Button>
      </Space>
      <Table
        loading={loading}
        rowKey="id"
        data={list}
        columns={[
          { title: '名称', dataIndex: 'name' },
          {
            title: '系统标识',
            dataIndex: 'code',
            render: (code) => (
              <Typography.Text type="secondary" code>
                {code}
              </Typography.Text>
            ),
          },
          { title: '排序', dataIndex: 'sortOrder' },
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
                      onDelete: () => api.delete(`/product-categories/${row.id}`),
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
        title={editId ? '编辑分类' : '新建分类'}
        visible={visible}
        onOk={submit}
        onCancel={() => setVisible(false)}
        unmountOnExit
      >
        <Form form={form} layout="vertical">
          <Form.Item label="名称" field="name" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input placeholder="如：手机、平板、配件" />
          </Form.Item>
          {editId ? (
            <Form.Item label="系统标识">
              <Input value={editingCode} disabled />
            </Form.Item>
          ) : (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
              系统标识将根据名称自动生成，无需填写
            </Typography.Text>
          )}
          <Form.Item label="排序" field="sortOrder">
            <InputNumber />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
