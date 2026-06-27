import { useEffect, useState } from 'react';
import { Button, Card, Message, Space, Table, Tabs } from '@arco-design/web-react';
import { useNavigate } from 'react-router-dom';
import { api, errMessage } from '../api/http-client';
import type { ProductModel } from '../types/api-types';

function summarizeItems(
  items?: Array<{ model?: ProductModel; quantity: number }>,
): string {
  if (!items?.length) return '-';
  const labels = items.map((item) => {
    const brand = item.model?.brand?.name ?? '-';
    const model = item.model?.name ?? '-';
    return `${brand} ${model}`.trim();
  });
  if (labels.length <= 2) return labels.join('、');
  return `${labels.slice(0, 2).join('、')} 等 ${labels.length} 项`;
}

function sourceTypeLabel(value?: string): string {
  if (value === 'SALES_ORDER') return '订单';
  if (value === 'REPAIR_ORDER') return '维修';
  if (value === 'SERVICE_ORDER') return '次卡';
  if (value === 'MANUAL') return '手工';
  return value || '-';
}

export default function StockInPage() {
  const navigate = useNavigate();
  const [inOrders, setInOrders] = useState<unknown[]>([]);
  const [outOrders, setOutOrders] = useState<unknown[]>([]);

  const load = async () => {
    const [ins, outs] = await Promise.all([
      api.get<unknown[]>('/stock-in-orders'),
      api.get<unknown[]>('/stock-out-orders'),
    ]);
    setInOrders(ins);
    setOutOrders(outs);
  };

  useEffect(() => {
    void load().catch((e) => Message.error(errMessage(e)));
  }, []);

  return (
    <>
      <h1 className="page-title">出入库</h1>
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" onClick={() => navigate('/stock-in/new')}>新建入库</Button>
          <Button onClick={() => navigate('/stock-in/out/new')}>新建出库</Button>
        </Space>
      </Card>
      <Tabs defaultActiveTab="in">
        <Tabs.TabPane key="in" title="入库单">
          <Table
            rowKey="id"
            data={inOrders as Array<{ id: string; source?: string; createdAt?: string; items?: Array<{ model?: ProductModel; quantity: number }> }>}
            columns={[
              { title: '单号', dataIndex: 'id' },
              { title: '采购渠道', dataIndex: 'source', render: (v) => v || '-' },
              { title: '品牌 / 型号', render: (_, r) => summarizeItems(r.items) },
              { title: '时间', dataIndex: 'createdAt', render: (v) => (v ? new Date(v).toLocaleString('zh-CN') : '-') },
              {
                title: '操作',
                render: (_, row) => (
                  <Space>
                    <Button size="small" onClick={() => navigate(`/stock-in/${row.id}`)}>查看</Button>
                  </Space>
                ),
              },
            ]}
          />
        </Tabs.TabPane>
        <Tabs.TabPane key="out" title="出库单">
          <Table
            rowKey="id"
            data={outOrders as Array<{ id: string; sourceType?: string; reason?: string; createdAt?: string; items?: Array<{ model?: ProductModel; quantity: number }> }>}
            columns={[
              { title: '单号', dataIndex: 'id' },
              { title: '来源', dataIndex: 'sourceType', render: (v) => sourceTypeLabel(v) },
              { title: '原因', dataIndex: 'reason', render: (v) => v || '-' },
              { title: '品牌 / 型号', render: (_, r) => summarizeItems(r.items) },
              { title: '时间', dataIndex: 'createdAt', render: (v) => (v ? new Date(v).toLocaleString('zh-CN') : '-') },
            ]}
          />
        </Tabs.TabPane>
      </Tabs>
    </>
  );
}
