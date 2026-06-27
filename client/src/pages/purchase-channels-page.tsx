import { useEffect, useState } from 'react';
import { Button, Form, Input, Message, Modal, Space, Table } from '@arco-design/web-react';
import { api, errMessage, isFormValidationError } from '../api/http-client';
import { confirmDelete } from '../utils/confirm-delete';
import type { Id, PaginatedList, PurchaseChannel } from '../types/api-types';
import { PAGE_SIZE, paginationTotal } from '../utils/pagination';
import { normalizePhone, phoneValidationMessage } from '../utils/phone';

export default function PurchaseChannelsPage() {
  const [list, setList] = useState<PurchaseChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editId, setEditId] = useState<Id | null>(null);
  const [form] = Form.useForm();

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await api.get<PaginatedList<PurchaseChannel>>(
        `/purchase-channels?page=${p}&pageSize=${PAGE_SIZE}`,
      );
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
    void load(1);
  }, []);

  const openCreate = () => {
    setEditId(null);
    form.resetFields();
    setVisible(true);
  };

  const openEdit = (row: PurchaseChannel) => {
    setEditId(row.id);
    form.setFieldsValue({
      name: row.name,
      contact: row.contact || '',
      phone: row.phone || '',
      note: row.note || '',
    });
    setVisible(true);
  };

  const submit = async () => {
    try {
      const values = await form.validate();
      const body = {
        name: values.name,
        contact: values.contact || null,
        phone: values.phone?.trim() ? normalizePhone(values.phone) : null,
        note: values.note || null,
      };
      if (editId) await api.patch(`/purchase-channels/${editId}`, body);
      else await api.post('/purchase-channels', body);
      Message.success(editId ? '已更新' : '已创建');
      setVisible(false);
      void load(page);
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    }
  };

  const remove = (id: Id) => {
    confirmDelete({
      content: '确定删除该采购渠道？历史入库单中的采购渠道文字不会被修改。',
      onDelete: () => api.delete(`/purchase-channels/${id}`),
      onSuccess: () => load(page),
    });
  };

  return (
    <>
      <h1 className="page-title">采购渠道</h1>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>
          新建采购渠道
        </Button>
      </Space>
      <Table
        loading={loading}
        rowKey="id"
        data={list}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: paginationTotal(page, PAGE_SIZE, list.length, hasMore),
          showTotal: true,
          onChange: (p) => void load(p),
        }}
        columns={[
          { title: '渠道名称', dataIndex: 'name' },
          { title: '联系人', dataIndex: 'contact', render: (v) => v || '-' },
          { title: '手机', dataIndex: 'phone', render: (v) => v || '-' },
          { title: '备注', dataIndex: 'note', render: (v) => v || '-' },
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
        title={editId ? '编辑采购渠道' : '新建采购渠道'}
        visible={visible}
        onOk={submit}
        onCancel={() => setVisible(false)}
        unmountOnExit
      >
        <Form form={form} layout="vertical">
          <Form.Item label="渠道名称" field="name" rules={[{ required: true, message: '请输入渠道名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="联系人" field="contact">
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
          <Form.Item label="备注" field="note">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
