import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Message,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import dayjs from 'dayjs';
import { IconRefresh } from '@arco-design/web-react/icon';
import { api, errMessage } from '../api/http-client';
import { formatMoney } from '../utils/format';

type ProfitReport = {
  period: 'week' | 'month' | 'year' | 'custom';
  startDate: string;
  endDate: string;
  salesRevenue: number;
  salesCost: number;
  salesProfit: number;
  salesRevenueGross: number;
  salesCostGross: number;
  salesRefundRevenue: number;
  salesRefundCost: number;
  repairRevenue: number;
  repairCost: number;
  repairProfit: number;
  serviceRevenue: number;
  serviceCost: number;
  serviceProfit: number;
  serviceCardRechargeAmount: number;
  serviceCardRemainingAmount: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  salesOrderCount: number;
  repairOrderCount: number;
  serviceOrderCount: number;
  serviceCardCount: number;
};

const PERIOD_OPTIONS = [
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
];

function moneyTone(value: number): 'red' | 'green' | 'blue' | 'arcoblue' {
  if (value < 0) return 'red';
  if (value > 0) return 'green';
  return 'blue';
}

export default function ProfitReportPage() {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (nextPeriod = period) => {
    setLoading(true);
    try {
      const data = await api.get<ProfitReport>(`/reports/profit?period=${nextPeriod}`);
      setReport(data);
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load().catch(() => {});
  }, []);

  const rangeText =
    report?.startDate && report?.endDate
      ? `${dayjs(report.startDate).format('YYYY-MM-DD HH:mm')} - ${dayjs(report.endDate).format('YYYY-MM-DD HH:mm')}`
      : '-';

  const breakdownRows = [
    {
      key: 'sales',
      name: '商品',
      revenue: report?.salesRevenue ?? 0,
      cost: report?.salesCost ?? 0,
      profit: report?.salesProfit ?? 0,
      count: report?.salesOrderCount ?? 0,
    },
    {
      key: 'refund',
      name: '商品退货冲减',
      revenue: -(report?.salesRefundRevenue ?? 0),
      cost: -(report?.salesRefundCost ?? 0),
      profit: -((report?.salesRefundRevenue ?? 0) - (report?.salesRefundCost ?? 0)),
      count: 0,
    },
    {
      key: 'repair',
      name: '维修',
      revenue: report?.repairRevenue ?? 0,
      cost: report?.repairCost ?? 0,
      profit: report?.repairProfit ?? 0,
      count: report?.repairOrderCount ?? 0,
    },
    {
      key: 'service',
      name: '次卡核销',
      revenue: report?.serviceRevenue ?? 0,
      cost: report?.serviceCost ?? 0,
      profit: report?.serviceProfit ?? 0,
      count: report?.serviceOrderCount ?? 0,
    },
    {
      key: 'card',
      name: '次卡充值',
      revenue: 0,
      cost: 0,
      profit: 0,
      count: report?.serviceCardCount ?? 0,
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>财务管理</h1>
          <Typography.Text type="secondary">按时间区间查看业务收入、成本、利润和次卡余额。</Typography.Text>
        </div>
        <Space>
          <Select
            value={period}
            style={{ width: 120 }}
            options={PERIOD_OPTIONS}
            onChange={(value) => {
              const next = value as 'week' | 'month' | 'year';
              setPeriod(next);
              void load(next);
            }}
          />
          <Button icon={<IconRefresh />} onClick={() => void load()}>
            刷新
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <Card size="small" style={{ border: '1px solid var(--color-border-2)' }}>
            <Statistic title="总收入" value={report?.totalRevenue ?? 0} prefix="¥" precision={2} />
          </Card>
          <Card size="small" style={{ border: '1px solid var(--color-border-2)' }}>
            <Statistic title="总成本" value={report?.totalCost ?? 0} prefix="¥" precision={2} />
          </Card>
          <Card size="small" style={{ border: '1px solid var(--color-border-2)' }}>
            <div style={{ color: `var(--color-${moneyTone(report?.totalProfit ?? 0)})` }}>
              <Statistic title="总利润" value={report?.totalProfit ?? 0} prefix="¥" precision={2} />
            </div>
          </Card>
          <Card size="small" style={{ border: '1px solid var(--color-border-2)' }}>
            <Statistic title="剩余履约金额" value={report?.serviceCardRemainingAmount ?? 0} prefix="¥" precision={2} />
          </Card>
        </div>
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          统计区间：{rangeText}
        </Typography.Text>
      </Card>

      <Card title="业务拆分" style={{ marginBottom: 16 }}>
        <Table
          loading={loading}
          rowKey="key"
          pagination={false}
          data={breakdownRows}
          columns={[
            { title: '业务', dataIndex: 'name' },
            { title: '单据数', dataIndex: 'count' },
            {
              title: '预收',
              render: (_, row) =>
                row.key === 'card' ? (
                  <span className="cell-nowrap">{formatMoney(report?.serviceCardRechargeAmount ?? 0)}</span>
                ) : (
                  '-'
                ),
            },
            {
              title: '收入',
              dataIndex: 'revenue',
              render: (v) => <span className="cell-nowrap">{formatMoney(v)}</span>,
            },
            {
              title: '成本',
              dataIndex: 'cost',
              render: (v) => <span className="cell-nowrap">{formatMoney(v)}</span>,
            },
            {
              title: '利润',
              dataIndex: 'profit',
              render: (v) => (
                <span className="cell-nowrap" style={{ color: `var(--color-${moneyTone(Number(v))})` }}>
                  {formatMoney(v)}
                </span>
              ),
            },
            {
              title: '说明',
              render: (_, row) =>
                row.key === 'card' ? (
                  <Tag color="arcoblue">充值为预收，不计入利润</Tag>
                ) : row.key === 'refund' ? (
                  <Tag color="red">退货冲减收入、成本和利润</Tag>
                ) : row.key === 'service' ? (
                  <Tag color="orange">核销商品按售价确认收入，按成本统计支出</Tag>
                ) : (
                  <Tag color="green">按订单明细汇总</Tag>
                ),
            },
          ]}
        />
      </Card>

      <Card title="口径说明">
        <Space direction="vertical" size={6}>
          <div>1. 商品利润 = 商品收入 - 商品成本。</div>
          <div>2. 维修利润 = 维修收入 - 维修配件成本。</div>
          <div>3. 次卡利润 = 核销收入 - 核销商品成本；次卡充值属于预收，不计入利润。</div>
          <div>4. 剩余履约金额 = 充值金额按剩余次数折算的未消费金额，属于待履约金额。</div>
        </Space>
      </Card>
    </>
  );
}
