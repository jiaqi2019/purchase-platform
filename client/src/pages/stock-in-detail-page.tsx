import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Message, Table } from '@arco-design/web-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errMessage } from '../api/http-client';
import type { InventoryItem, ProductModel } from '../types/api-types';
import { formatMoney } from '../utils/format';

interface StockInDetail {
  id: string;
  source: string | null;
  note: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    quantity: number;
    costPrice: string | number | null;
    attributes: Record<string, unknown> | null;
    model?: ProductModel;
    inventoryItems?: InventoryItem[];
  }>;
}

function formatAttributes(attributes?: Record<string, unknown> | null): string {
  if (!attributes) return '-';
  const entries = Object.entries(attributes).filter(([, value]) => value !== '' && value != null);
  if (!entries.length) return '-';
  return entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join('、') : String(value)}`).join('；');
}

export default function StockInDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [detail, setDetail] = useState<StockInDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<StockInDetail>(`/stock-in-orders/${id}`)
      .then(setDetail)
      .catch((e) => Message.error(errMessage(e)));
  }, [id]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button onClick={() => navigate('/stock-in')}>返回</Button>
        <h1 className="page-title" style={{ margin: 0 }}>入库详情</h1>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Descriptions
          column={2}
          data={[
            { label: '单号', value: detail?.id ?? '-' },
            { label: '来源', value: detail?.source || '-' },
            {
              label: '时间',
              value: detail?.createdAt ? new Date(detail.createdAt).toLocaleString('zh-CN') : '-',
            },
            { label: '备注', value: detail?.note || '-' },
          ]}
        />
      </Card>
      <Table
        rowKey="id"
        data={detail?.items ?? []}
        columns={[
          { title: '品类', render: (_, row) => row.model?.category?.name ?? '-' },
          { title: '品牌', render: (_, row) => row.model?.brand?.name ?? '-' },
          { title: '型号', render: (_, row) => row.model?.name ?? '-' },
          { title: '数量', dataIndex: 'quantity' },
          { title: '成本价', dataIndex: 'costPrice', render: formatMoney },
          { title: '属性', render: (_, row) => formatAttributes(row.attributes) },
        ]}
      />
      {(detail?.items ?? []).some((item) => item.model?.trackingMode === 'SERIALIZED') && (
        <Card title="单品明细" style={{ marginTop: 16 }}>
          <Table
            rowKey="id"
            data={(detail?.items ?? [])
              .filter((item) => item.model?.trackingMode === 'SERIALIZED')
              .flatMap((item) => item.inventoryItems ?? [])}
            columns={[
              { title: '编号', dataIndex: 'id' },
              { title: '状态', dataIndex: 'status' },
              { title: '成本价', dataIndex: 'costPrice', render: formatMoney },
              { title: '属性', render: (_, row) => formatAttributes(row.attributes) },
            ]}
          />
        </Card>
      )}
    </>
  );
}
