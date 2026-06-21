import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Message,
  Select,
  Space,
} from '@arco-design/web-react';
import { useNavigate } from 'react-router-dom';
import { api, errMessage, isFormValidationError } from '../api/http-client';
import type { InventoryItem, PaginatedList, ProductModel } from '../types/api-types';

export default function StockOutCreatePage() {
  const navigate = useNavigate();
  const [models, setModels] = useState<ProductModel[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId),
    [models, selectedModelId],
  );

  useEffect(() => {
    api
      .get<PaginatedList<ProductModel>>('/product-models?page=1&pageSize=200')
      .then((res) => setModels(res.items))
      .catch((e) => Message.error(errMessage(e)));
  }, []);

  useEffect(() => {
    if (!selectedModelId || selectedModel?.trackingMode !== 'SERIALIZED') {
      setInventoryItems([]);
      return;
    }
    api
      .get<PaginatedList<InventoryItem>>(
        `/inventory/items?modelId=${selectedModelId}&status=IN_STOCK&page=1&pageSize=200`,
      )
      .then((res) => setInventoryItems(res.items))
      .catch((e) => Message.error(errMessage(e)));
  }, [selectedModelId, selectedModel?.trackingMode]);

  const submit = async () => {
    try {
      setSubmitting(true);
      const values = await form.validate();
      if (!selectedModel) {
        Message.error('请选择型号');
        return;
      }
      await api.post('/stock-out-orders', {
        reason: values.reason || null,
        note: values.note || null,
        items: [
          selectedModel.trackingMode === 'SERIALIZED'
            ? {
                inventoryItemId: values.inventoryItemId,
                quantity: 1,
              }
            : {
                modelId: selectedModel.id,
                quantity: values.quantity,
              },
        ],
      });
      Message.success('出库成功');
      navigate('/stock-in');
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button onClick={() => navigate('/stock-in')}>返回</Button>
        <h1 className="page-title" style={{ margin: 0 }}>新建出库</h1>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Space align="start" wrap>
            <Form.Item label="型号" field="modelId" rules={[{ required: true }]} style={{ width: 300 }}>
              <Select
                showSearch
                placeholder="选择品牌/型号"
                value={selectedModelId}
                onChange={(value) => {
                  setSelectedModelId(value);
                  form.setFieldsValue({ modelId: value, inventoryItemId: undefined });
                }}
                filterOption={(input, option) =>
                  String(option?.props?.children ?? '').toLowerCase().includes(input.toLowerCase())
                }
              >
                {models.map((model) => (
                  <Select.Option key={model.id} value={model.id}>
                    {`${model.brand?.name ?? '-'} ${model.name}（${model.stock ?? 0}）`}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            {selectedModel?.trackingMode === 'SERIALIZED' ? (
              <Form.Item label="库存单品" field="inventoryItemId" rules={[{ required: true }]} style={{ width: 320 }}>
                <Select placeholder="选择具体单品" showSearch>
                  {inventoryItems.map((item) => (
                    <Select.Option key={item.id} value={item.id}>
                      {item.imei || item.sn || item.imei2 || `单品 ${item.id}`}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            ) : (
              <Form.Item label="数量" field="quantity" rules={[{ required: true }]} style={{ width: 140 }}>
                <InputNumber min={1} />
              </Form.Item>
            )}
            <Form.Item label="原因" field="reason" style={{ width: 220 }}>
              <Input placeholder="如调拨、报损、盘点出库" />
            </Form.Item>
          </Space>
          <Form.Item label="备注" field="note">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Card>
      <Space>
        <Button type="primary" loading={submitting} onClick={submit}>确认出库</Button>
        <Button onClick={() => navigate('/stock-in')}>取消</Button>
      </Space>
    </>
  );
}
