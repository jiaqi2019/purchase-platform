import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Button,
  Card,
  Form,
  InputNumber,
  Message,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
} from '@arco-design/web-react';
import { api, errMessage } from '../api/http-client';
import type { BirthdayReminder, BirthdayReminderSettings, PaginatedList } from '../types/api-types';
import { EllipsisText } from '../components/ellipsis-text';
import { formatMoney } from '../utils/format';
import { PAGE_SIZE, paginationTotal } from '../utils/pagination';

export default function BirthdayRemindersPage() {
  const location = useLocation();
  const [settings, setSettings] = useState<BirthdayReminderSettings | null>(null);
  const [reminders, setReminders] = useState<BirthdayReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [form] = Form.useForm();

  const loadReminders = async (p = page) => {
    setLoading(true);
    try {
      const res = await api.get<PaginatedList<BirthdayReminder>>(
        `/birthday-reminders?status=PENDING&page=${p}&pageSize=${PAGE_SIZE}`,
      );
      setReminders(res.items);
      setHasMore(res.hasMore);
      setPage(p);
    } catch (e) {
      Message.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const refreshPage = useCallback(async () => {
    try {
      const s = await api.get<BirthdayReminderSettings>('/birthday-reminder-settings');
      setSettings(s);
      form.setFieldsValue({
        leadDays: s.leadDays,
        enabled: s.enabled,
      });
    } catch (e) {
      Message.error(errMessage(e));
    }
    await loadReminders(1);
  }, [form]);

  useEffect(() => {
    void refreshPage();
  }, [location.pathname, refreshPage]);

  const openSettings = () => {
    if (settings) {
      form.setFieldsValue({
        leadDays: settings.leadDays,
        enabled: settings.enabled,
      });
    }
    setSettingsVisible(true);
  };

  const saveSettings = async () => {
    try {
      const values = await form.validate();
      const updated = await api.patch<BirthdayReminderSettings>(
        '/birthday-reminder-settings',
        values,
      );
      setSettings(updated);
      setSettingsVisible(false);
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
      void loadReminders(page);
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
      void loadReminders(1);
    } catch (e) {
      Message.error(errMessage(e));
    }
  };

  if (!settings) return null;

  return (
    <>
      <h1 className="page-title">生日提醒</h1>
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" onClick={openSettings}>
            提醒设置
          </Button>
          <Button type="outline" onClick={runJob}>
            手动执行任务
          </Button>
        </Space>
      </Card>
      <Card title="待办列表">
        <Table
          loading={loading}
          rowKey="id"
          data={reminders}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: paginationTotal(page, PAGE_SIZE, reminders.length, hasMore),
            showTotal: true,
            onChange: (p) => void loadReminders(p),
          }}
          columns={[
            { key: 'name', title: '姓名', render: (_, r) => r.buyer?.name ?? '-' },
            { key: 'phone', title: '手机', render: (_, r) => r.buyer?.phone || '-' },
            {
              key: 'buyerBirthday',
              title: '生日',
              render: (_, r) =>
                r.buyer?.birthday ? String(r.buyer.birthday).slice(0, 10) : '-',
            },
            {
              key: 'address',
              title: '地址',
              width: 180,
              render: (_, r) => <EllipsisText text={r.buyer?.address} />,
            },
            {
              key: 'permanentAddress',
              title: '常住地址',
              width: 180,
              render: (_, r) => <EllipsisText text={r.buyer?.permanentAddress} />,
            },
            {
              key: 'hasPurchases',
              title: '购买记录',
              render: (_, r) =>
                r.hasPurchases ? (
                  <Tag color="green">有</Tag>
                ) : (
                  <Tag color="red">无</Tag>
                ),
            },
            {
              key: 'totalSpent',
              title: '消费金额',
              render: (_, r) => (
                <span className="cell-nowrap">{formatMoney(r.totalSpent ?? 0)}</span>
              ),
            },
            {
              key: 'targetBirthday',
              title: '目标生日',
              dataIndex: 'birthday',
              render: (v) => String(v).slice(0, 10),
            },
            { key: 'leadDays', title: '提前天数', dataIndex: 'leadDays' },
            {
              key: 'createdAt',
              title: '创建时间',
              dataIndex: 'createdAt',
              render: (v) => new Date(v).toLocaleString('zh-CN'),
            },
            {
              key: 'actions',
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
      <Modal
        title="提醒设置"
        visible={settingsVisible}
        onOk={saveSettings}
        onCancel={() => setSettingsVisible(false)}
        unmountOnExit
      >
        <Form form={form} layout="vertical">
          <Form.Item label="提前天数 (n)" field="leadDays">
            <InputNumber min={0} max={365} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="启用生日提醒" field="enabled" triggerPropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
