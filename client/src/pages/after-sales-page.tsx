import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Message, Modal, Select, Space, Table, Tag, Typography } from '@arco-design/web-react';
import { api, errMessage, isFormValidationError } from '../api/http-client';
import type { Purchase, PurchaseQueryResult } from '../types/api-types';

type AfterSaleRow = {
  id: string;
  type: string;
  status: string;
  salesOrder?: Purchase;
  note?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  items?: Array<{
    id: string;
    quantity: number;
    newAttributes?: Record<string, unknown> | null;
    salesOrderItem?: {
      id: string;
      name: string;
      quantity: number;
      price: string | number;
      status?: string;
      model?: {
        name: string;
        brand?: { name: string } | null;
      } | null;
      inventoryItem?: {
        id: string;
        imei?: string | null;
        imei2?: string | null;
        sn?: string | null;
      } | null;
    } | null;
  }>;
};

function typeLabel(type: string): string {
  return type === 'RETURN' ? '退货' : '换货';
}

function statusTag(status: string) {
  if (status === 'COMPLETED') return <Tag color="green">已结束</Tag>;
  if (status === 'PROCESSING') return <Tag color="orange">售后中</Tag>;
  if (status === 'PENDING') return <Tag color="gray">待处理</Tag>;
  if (status === 'CANCELLED') return <Tag color="red">已取消</Tag>;
  return <Tag>{status}</Tag>;
}

export default function AfterSalesPage() {
  const [rows, setRows] = useState<AfterSaleRow[]>([]);
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [visible, setVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedRow, setSelectedRow] = useState<AfterSaleRow | null>(null);
  const [form] = Form.useForm();
  const salesOrderId = Form.useWatch('salesOrderId', form);
  const currentOrder = useMemo(() => orders.find((o) => o.id === salesOrderId), [orders, salesOrderId]);

  const load = async () => {
    const [afterRows, sales] = await Promise.all([
      api.get<AfterSaleRow[]>('/after-sales'),
      api.get<PurchaseQueryResult>('/sales-orders?page=1&pageSize=100'),
    ]);
    setRows(afterRows);
    setOrders(sales.items);
  };

  useEffect(() => {
    void load().catch((e) => Message.error(errMessage(e)));
  }, []);

  const submit = async () => {
    try {
      const v = await form.validate();
      await api.post('/after-sales', {
        salesOrderId: v.salesOrderId,
        type: v.type,
        note: v.note || null,
        items: (v.salesOrderItemIds ?? []).map((id: string) => ({
          salesOrderItemId: id,
        })),
      });
      Message.success('售后单已创建');
      setVisible(false);
      form.resetFields();
      await load();
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    }
  };

  const completeExchange = async (id: string) => {
    try {
      await api.post(`/after-sales/${id}/complete-exchange`, {});
      Message.success('换货已结束');
      await load();
    } catch (e) {
      Message.error(errMessage(e));
    }
  };

  const openDetail = (row: AfterSaleRow) => {
    setSelectedRow(row);
    setDetailVisible(true);
  };

  return (
    <>
      <h1 className="page-title">售后订单</h1>
      <Card style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setVisible(true)}>
          新建售后单
        </Button>
      </Card>
      <Table
        rowKey="id"
        data={rows}
        columns={[
          { title: '单号', dataIndex: 'id' },
          { title: '类型', dataIndex: 'type', render: (v) => typeLabel(String(v)) },
          { title: '状态', dataIndex: 'status', render: (v) => statusTag(String(v)) },
          { title: '消费者', render: (_, r) => r.salesOrder?.buyer?.name ?? '-' },
          {
            title: '商品',
            render: (_, r) => r.items?.map((i) => i.salesOrderItem?.name).filter(Boolean).join('、') ?? '-',
          },
          {
            title: '操作',
            render: (_, r) => (
              <Space>
                <Button size="small" onClick={() => openDetail(r)}>
                  查看详情
                </Button>
                {r.type === 'EXCHANGE' && r.status === 'PROCESSING' ? (
                  <Button size="small" type="primary" onClick={() => completeExchange(r.id)}>
                    完成换货
                  </Button>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="售后详情"
        visible={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        unmountOnExit
        style={{ width: 900 }}
      >
        {selectedRow ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Card size="small">
              <Space direction="vertical" size={4}>
                <div>售后单号：{selectedRow.id}</div>
                <div>原订单：{selectedRow.salesOrder?.id ?? '-'}</div>
                <div>消费者：{selectedRow.salesOrder?.buyer?.name ?? '-'}</div>
                <div>类型：{typeLabel(selectedRow.type)}</div>
                <div>状态：{statusTag(selectedRow.status)}</div>
                <div>创建时间：{selectedRow.createdAt ? new Date(selectedRow.createdAt).toLocaleString('zh-CN') : '-'}</div>
                <div>完成时间：{selectedRow.completedAt ? new Date(selectedRow.completedAt).toLocaleString('zh-CN') : '-'}</div>
                <div>备注：{selectedRow.note || '-'}</div>
              </Space>
            </Card>
            <Table
              rowKey="id"
              pagination={false}
              data={selectedRow.items ?? []}
              columns={[
                { title: '商品名称', render: (_, item) => item.salesOrderItem?.name ?? '-' },
                { title: '品牌', render: (_, item) => item.salesOrderItem?.model?.brand?.name ?? '-' },
                { title: '型号', render: (_, item) => item.salesOrderItem?.model?.name ?? '-' },
                { title: '数量', dataIndex: 'quantity' },
                {
                  title: '单价',
                  render: (_, item) => (
                    <span className="cell-nowrap">{item.salesOrderItem ? `¥${Number(item.salesOrderItem.price).toFixed(2)}` : '-'}</span>
                  ),
                },
                {
                  title: '售后状态',
                  render: (_, item) => {
                    const status = item.salesOrderItem?.status ?? 'SOLD';
                    if (status === 'RETURNED') return <Tag color="green">已退货</Tag>;
                    if (status === 'EXCHANGING') return <Tag color="orange">换货中</Tag>;
                    if (status === 'EXCHANGED') return <Tag color="green">已换货</Tag>;
                    return <Tag color="gray">未售后</Tag>;
                  },
                },
                {
                  title: '库存单品',
                  render: (_, item) => {
                    const inv = item.salesOrderItem?.inventoryItem;
                    return inv ? inv.imei || inv.imei2 || inv.sn || `单品 ${inv.id}` : '-';
                  },
                },
              ]}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        title="新建售后单"
        visible={visible}
        onOk={submit}
        onCancel={() => setVisible(false)}
        unmountOnExit
        style={{ width: 760 }}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="销售订单" field="salesOrderId" rules={[{ required: true }]}>
            <Select
              showSearch
              allowClear
              onChange={() => form.setFieldsValue({ salesOrderItemIds: [] })}
              placeholder="选择订单"
            >
              {orders.map((o) => (
                <Select.Option key={o.id} value={o.id}>
                  {`${o.buyer?.name ?? '-'} / ${new Date(o.purchasedAt).toLocaleString('zh-CN')}`}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="商品明细"
            field="salesOrderItemIds"
            rules={[{ required: true, message: '请选择至少一条明细' }]}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="可多选明细"
              disabled={!currentOrder}
            >
              {currentOrder?.items.map((i) => (
                <Select.Option key={i.id} value={i.id}>
                  {`${i.name} × ${i.quantity}`}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="售后类型" field="type" rules={[{ required: true }]}>
            <Select placeholder="选择类型">
              <Select.Option value="RETURN">退货</Select.Option>
              <Select.Option value="EXCHANGE">换货</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="备注" field="note">
            <Input.TextArea rows={2} maxLength={500} showWordLimit placeholder="选填" />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary">
          换货单创建后状态会显示为“售后中”，厂家回货后点“完成换货”即可结束。
        </Typography.Text>
      </Modal>
    </>
  );
}
