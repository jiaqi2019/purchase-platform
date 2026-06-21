import { useEffect, useState } from "react";
import {
  Button,
  DatePicker,
  Form,
  Input,
  Message,
  Modal,
  Space,
  Table,
} from "@arco-design/web-react";
import dayjs from "dayjs";
import { api, errMessage, isFormValidationError } from "../api/http-client";
import { confirmDelete } from "../utils/confirm-delete";
import type { Buyer, BuyerPhoto, Id, PaginatedList } from "../types/api-types";
import { PAGE_SIZE, paginationTotal } from "../utils/pagination";
import { normalizePhone, phoneValidationMessage } from "../utils/phone";

export default function BuyersPage() {
  const [list, setList] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editId, setEditId] = useState<Id | null>(null);
  const [photos, setPhotos] = useState<BuyerPhoto[]>([]);
  const [form] = Form.useForm();

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await api.get<PaginatedList<Buyer>>(
        `/buyers?page=${p}&pageSize=${PAGE_SIZE}`,
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
    setPhotos([]);
    form.resetFields();
    setVisible(true);
  };

  const openEdit = (b: Buyer) => {
    setEditId(b.id);
    api
      .get<BuyerPhoto[]>(`/buyers/${b.id}/photos`)
      .then(setPhotos)
      .catch(() => setPhotos([]));
    form.setFieldsValue({
      name: b.name,
      phone: b.phone || "",
      birthday: b.birthday ? dayjs(b.birthday.slice(0, 10)) : undefined,
      address: b.address || "",
      permanentAddress: b.permanentAddress || "",
    });
    setVisible(true);
  };

  const submit = async () => {
    try {
      const values = await form.validate();
      const body = {
        ...values,
        phone: values.phone?.trim() ? normalizePhone(values.phone) : null,
        birthday: values.birthday
          ? dayjs(values.birthday).format("YYYY-MM-DD")
          : null,
      };
      if (editId) await api.patch(`/buyers/${editId}`, body);
      else await api.post("/buyers", body);
      Message.success(editId ? "已更新" : "已创建");
      setVisible(false);
      void load(page);
    } catch (e) {
      if (isFormValidationError(e)) return;
      Message.error(errMessage(e));
    }
  };

  const uploadPhoto = async (file?: File) => {
    if (!editId || !file) return;
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const photo = await api.post<BuyerPhoto>(`/buyers/${editId}/photos`, {
      fileName: file.name,
      mimeType: file.type,
      dataBase64,
    });
    setPhotos((rows) => [photo, ...rows]);
    Message.success("照片已上传");
  };

  const remove = (id: Id) => {
    confirmDelete({
      content: "确定删除该购买者？已有消费记录将无法删除。",
      onDelete: () => api.delete(`/buyers/${id}`),
      onSuccess: () => load(page),
    });
  };

  const resetAllData = () => {
    Modal.confirm({
      title: "清空所有数据",
      content:
        "这会清空当前数据库里的全部业务数据，包含购买者、订单、库存、次卡等。确定继续？",
      onOk: async () => {
        await api.post("/internal/reset-all-data", {
          confirm: "RESET_ALL_DATA",
        });
        Message.success("已清空所有数据");
        setVisible(false);
        setEditId(null);
        setPhotos([]);
        form.resetFields();
        await load(1);
      },
    });
  };

  return (
    <>
      <h1 className="page-title">购买者</h1>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>
          新建购买者
        </Button>
        {/* <Button status="danger" onClick={resetAllData}>
          清空所有数据
        </Button> */}
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
          { title: "姓名", dataIndex: "name" },
          { title: "手机", dataIndex: "phone", render: (v) => v || "-" },
          {
            title: "生日",
            dataIndex: "birthday",
            render: (v) => (v ? String(v).slice(0, 10) : "-"),
          },
          { title: "地址", dataIndex: "address", render: (v) => v || "-" },
          {
            title: "操作",
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Button
                  size="small"
                  status="danger"
                  onClick={() => remove(row.id)}
                >
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editId ? "编辑购买者" : "新建购买者"}
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
                  const trimmed = value?.trim() ?? "";
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
            <DatePicker
              style={{ width: "100%" }}
              format="YYYY-MM-DD"
              placeholder="请选择生日"
            />
          </Form.Item>
          <Form.Item label="地址" field="address">
            <Input />
          </Form.Item>
          <Form.Item label="常住地址" field="permanentAddress">
            <Input />
          </Form.Item>
          {editId && (
            <Form.Item label="照片">
              <Space direction="vertical" style={{ width: "100%" }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void uploadPhoto(e.target.files?.[0])}
                />
                <Space wrap>
                  {photos.map((photo) => (
                    <img
                      key={photo.id}
                      src={photo.url}
                      alt={photo.fileName}
                      style={{
                        width: 72,
                        height: 72,
                        objectFit: "cover",
                        borderRadius: 4,
                      }}
                    />
                  ))}
                </Space>
              </Space>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
