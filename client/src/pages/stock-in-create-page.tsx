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
import type { ModelSpecDefinition, PaginatedList, ProductModel } from '../types/api-types';

function getOptions(spec: ModelSpecDefinition): string[] {
  return Array.isArray(spec.options) ? spec.options.map(String).filter(Boolean) : [];
}

function renderSpecInput(spec: ModelSpecDefinition) {
  const options = getOptions(spec);
  if (options.length > 0 || spec.valueType === 'SINGLE_SELECT' || spec.valueType === 'MULTI_SELECT') {
    return (
      <Select
        mode={spec.valueType === 'MULTI_SELECT' ? 'multiple' : undefined}
        allowClear
        placeholder={options.length ? '请选择' : '暂无可选值'}
        disabled={!options.length}
      >
        {options.map((option) => (
          <Select.Option key={option} value={option}>
            {option}
          </Select.Option>
        ))}
      </Select>
    );
  }
  if (spec.valueType === 'NUMBER') {
    return <InputNumber precision={0} style={{ width: '100%' }} />;
  }
  return <Input />;
}

export default function StockInCreatePage() {
  const navigate = useNavigate();
  const [models, setModels] = useState<ProductModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId),
    [models, selectedModelId],
  );

  useEffect(() => {
    api
      .get<PaginatedList<ProductModel>>('/product-models?page=1&pageSize=200')
      .then((res) => setModels(res.items))
      .catch((e) => Message.error(errMessage(e)));
  }, []);

  const submit = async () => {
    try {
      setSubmitting(true);
      const values = await form.validate();
      if (!selectedModel) {
        Message.error('请选择型号');
        return;
      }
      const attributes: Record<string, unknown> = {};
      for (const spec of selectedModel.specDefinitions ?? []) {
        attributes[spec.code] = values[`attr_${spec.code}`] ?? '';
      }
      await api.post('/stock-in-orders', {
        source: values.source || null,
        note: values.note || null,
        items: [
          selectedModel.trackingMode === 'SERIALIZED'
            ? {
                modelId: selectedModel.id,
                costPrice: values.costPrice,
                serializedItems: [{ attributes, costPrice: values.costPrice }],
              }
            : {
                modelId: selectedModel.id,
                quantity: values.quantity,
                costPrice: values.costPrice,
                attributes,
              },
        ],
      });
      Message.success('入库成功');
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
        <h1 className="page-title" style={{ margin: 0 }}>新建入库</h1>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Space align="start" wrap>
            <Form.Item label="型号" field="modelId" rules={[{ required: true }]} style={{ width: 300 }}>
              <Select
                showSearch
                placeholder="选择品牌/型号"
                value={selectedModelId}
                onChange={(v) => {
                  setSelectedModelId(v);
                  form.setFieldsValue({ modelId: v });
                }}
                filterOption={(input, option) =>
                  String(option?.props?.children ?? '').toLowerCase().includes(input.toLowerCase())
                }
              >
                {models.map((m) => (
                  <Select.Option key={m.id} value={m.id}>{`${m.brand?.name ?? '-'} ${m.name}`}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="成本价" field="costPrice" rules={[{ required: true, message: '成本价必填' }]} style={{ width: 160 }}>
              <InputNumber min={0} precision={2} />
            </Form.Item>
            {selectedModel?.trackingMode === 'QUANTITY' && (
              <Form.Item label="数量" field="quantity" rules={[{ required: true }]} style={{ width: 140 }}>
                <InputNumber min={1} />
              </Form.Item>
            )}
            <Form.Item label="来源" field="source" style={{ width: 180 }}>
              <Input />
            </Form.Item>
          </Space>
          <Space align="start" wrap>
            {selectedModel?.specDefinitions?.map((spec) => (
              <Form.Item
                key={spec.id}
                label={spec.name}
                field={`attr_${spec.code}`}
                rules={spec.required || spec.uniqueValue ? [{ required: true, message: `${spec.name} 必填` }] : undefined}
                style={{ width: 200 }}
              >
                {renderSpecInput(spec)}
              </Form.Item>
            ))}
          </Space>
          <Form.Item label="备注" field="note">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Card>
      <Space>
        <Button type="primary" loading={submitting} onClick={submit}>确认入库</Button>
        <Button onClick={() => navigate('/stock-in')}>取消</Button>
      </Space>
    </>
  );
}
