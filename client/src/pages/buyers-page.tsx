import { useEffect, useState } from 'react';
import { Button, DatePicker, Form, Input, Message, Modal, Space, Table } from '@arco-design/web-react';
import dayjs from 'dayjs';
import { api, errMessage } from '../api/http-client';
import { confirmDelete } from '../utils/confirm-delete';
import type { Buyer, Id } from '../types/api-types';
import { normalizePhone, phoneValidationMessage } from '../utils/phone';

export default function BuyersPage() {
  const [list, setList] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editId, setEditId] = useState<Id | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setList(await api.get<Buyer[]>('/buyers'));
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
    form.resetFields();
    setVisible(true);
  };

  const openEdit = (b: Buyer) => {
    setEditId(b.id);
    form.setFieldsValue({
      name: b.name,
      phone: b.phone || '',
      birthday: b.birthday ? dayjs(b.birthday.slice(0, 10)) : undefined,
      address: b.address || '',
      permanentAddress: b.permanentAddress || '',
    });
    setVisible(true);
  };

  const submit = async () => {
    try {
      const values = await form.validate();
      const body = {
        ...values,
        phone: values.phone?.trim() ? normalizePhone(values.phone) : null,
        birthday: values.birthday ? dayjs(values.birthday).format('YYYY-MM-DD') : null,
      };
      if (editId) await api.patch(`/buyers/${editId}`, body);
      else await api.post('/buyers', body);
      Message.success(editId ? '已更新' : '已创建');
      setVisible(false);
      load();
    } catch (e) {
      if (e && typeof e === 'object' && 'error' in e) return;
      Message.error(errMessage(e));
    }
  };

  const remove = (id: Id) => {
    confirmDelete({
      content: '确定删除该购买者？已有消费记录将无法删除。',
      onDelete: () => api.delete(`/buyers/${id}`),
      onSuccess: load,
    });
  };

  return (
    <>
      <h1 className="page-title">购买者</h1>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>
          新建购买者
        </Button>
      </Space>
      <Table
        loading={loading}
        rowKey="id"
        data={list}
        columns={[
          { title: '姓名', dataIndex: 'name' },
          { title: '手机', dataIndex: 'phone', render: (v) => v || '-' },
          {
            title: '生日',
            dataIndex: 'birthday',
            render: (v) => (v ? String(v).slice(0, 10) : '-'),
          },
          { title: '地址', dataIndex: 'address', render: (v) => v || '-' },
          {
            title: '操作',
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Button size="small" status="danger" onClick={() => remove(row.id)}>
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editId ? '编辑购买者' : '新建购买者'}
        visible={visible}
        onOk={submit}
        onCancel={() => setVisible(false)}
        unmountOnExit
      >
        <Form form={form} layout="vertical">
          <Form.Item label="姓名" field="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label="手机"
            field="phone"
            rules={[
              {
                validator: (value, callback) => {
                  const trimmed = value?.trim() ?? '';
                  if (!trimmed) {
                    callback();
                    return;
                  }
                  const msg = phoneValidationMessage(trimmed, false);
                  if (msg) callback(msg);
                  else callback();
                },
              },
            ]}
          >
            <Input maxLength={11} placeholder="选填，11位手机号" allowClear />
          </Form.Item>
          <Form.Item label="生日" field="birthday">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="请选择生日" />
          </Form.Item>
          <Form.Item label="地址" field="address">
            <Input />
          </Form.Item>
          <Form.Item label="常住地址" field="permanentAddress">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
