import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Button,
  Card,
  Form,
  InputNumber,
  Message,
  Space,
  Switch,
  Table,
  Tag,
} from '@arco-design/web-react';
import { api, errMessage } from '../api/http-client';
import type { AppSettings, BirthdayReminder } from '../types/api-types';
import { EllipsisText } from '../components/ellipsis-text';
import { formatMoney } from '../utils/format';

export default function BirthdayRemindersPage() {
  const location = useLocation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [reminders, setReminders] = useState<BirthdayReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const loadReminders = useCallback(async () => {
    setLoading(true);
    try {
      setReminders(await api.get<BirthdayReminder[]>('/birthday-reminders?status=PENDING'));
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPage = useCallback(async () => {
    try {
      const s = await api.get<AppSettings>('/settings');
      setSettings(s);
      form.setFieldsValue({
        birthdayLeadDays: s.birthdayLeadDays,
        birthdayReminderEnabled: s.birthdayReminderEnabled,
      });
    } catch (e) {
      Message.error(errMessage(e));
    }
    await loadReminders();
  }, [form, loadReminders]);

  useEffect(() => {
    void refreshPage();
  }, [location.pathname, refreshPage]);

  const saveSettings = async () => {
    try {
      const values = await form.validate();
      const updated = await api.patch<AppSettings>('/settings', values);
      setSettings(updated);
      Message.success('设置已保存');
    } catch (e) {
      if (e && typeof e === 'object' && 'error' in e) return;
      Message.error(errMessage(e));
    }
  };

  const markDone = async (id: string) => {
    try {
      await api.patch(`/birthday-reminders/${id}`, { status: 'DONE' });
      Message.success('已标记');
      loadReminders();
    } catch (e) {
      Message.error(errMessage(e));
    }
  };

  const runJob = async () => {
    try {
      const res = await fetch('/api/internal/run-birthday-job', {
        method: 'POST',
        headers: { 'x-internal-token': 'dev-token' },
      });
      const json = (await res.json()) as { data?: { created?: number }; error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message || res.statusText);
      Message.success(`任务已执行，新建 ${json.data?.created ?? 0} 条提醒`);
      loadReminders();
    } catch (e) {
      Message.error(errMessage(e));
    }
  };

  if (!settings) return null;

  return (
    <>
      <h1 className="page-title">生日提醒</h1>
      <Card title="提醒设置" style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline">
          <Form.Item label="提前天数 (n)" field="birthdayLeadDays">
            <InputNumber min={0} max={365} />
          </Form.Item>
          <Form.Item label="启用" field="birthdayReminderEnabled" triggerPropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" onClick={saveSettings}>
                保存设置
              </Button>
              <Button onClick={runJob}>手动执行任务</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      <Card title="待办列表">
        <Table
          loading={loading}
          rowKey="id"
          data={reminders}
          columns={[
            { title: '姓名', render: (_, r) => r.buyer?.name ?? '-' },
            { title: '手机', render: (_, r) => r.buyer?.phone || '-' },
            {
              title: '生日',
              render: (_, r) =>
                r.buyer?.birthday ? String(r.buyer.birthday).slice(0, 10) : '-',
            },
            {
              title: '地址',
              width: 180,
              render: (_, r) => <EllipsisText text={r.buyer?.address} />,
            },
            {
              title: '常住地址',
              width: 180,
              render: (_, r) => <EllipsisText text={r.buyer?.permanentAddress} />,
            },
            {
              title: '购买记录',
              render: (_, r) =>
                r.hasPurchases ? (
                  <Tag color="green">有</Tag>
                ) : (
                  <Tag color="red">无</Tag>
                ),
            },
            {
              title: '消费金额',
              render: (_, r) => (
                <span className="cell-nowrap">{formatMoney(r.totalSpent ?? 0)}</span>
              ),
            },
            {
              title: '目标生日',
              dataIndex: 'birthday',
              render: (v) => String(v).slice(0, 10),
            },
            { title: '提前天数', dataIndex: 'leadDays' },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              render: (v) => new Date(v).toLocaleString('zh-CN'),
            },
            {
              title: '操作',
              render: (_, row) => (
                <Button size="small" type="primary" onClick={() => markDone(row.id)}>
                  已问候
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
