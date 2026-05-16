import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Message,
  Modal,
  Select,
  Space,
  Table,
} from "@arco-design/web-react";
import { api, errMessage } from "../api/http-client";
import { confirmDelete } from "../utils/confirm-delete";
import type { Brand, Id, PaginatedList, Product, ProductCategory } from "../types/api-types";
import { formatMoney, toInputNumber } from "../utils/format";
import { PAGE_SIZE, paginationTotal } from "../utils/pagination";

export default function ProductsPage() {
  const [list, setList] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filterCategoryId, setFilterCategoryId] = useState<string>();
  const [filterBrandId, setFilterBrandId] = useState<string>();
  const [searchName, setSearchName] = useState("");
  const [searchInputKey, setSearchInputKey] = useState(0);
  const [visible, setVisible] = useState(false);
  const [editId, setEditId] = useState<Id | null>(null);
  const [form] = Form.useForm();

  const categoryId = Form.useWatch("categoryId", form);

  const loadProducts = async (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(p),
      pageSize: String(PAGE_SIZE),
    });
    if (filterCategoryId) params.set("categoryId", filterCategoryId);
    if (filterBrandId) params.set("brandId", filterBrandId);
    if (searchName.trim()) params.set("q", searchName.trim());
    try {
      const res = await api.get<PaginatedList<Product>>(`/products?${params}`);
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
    api
      .get<ProductCategory[]>("/product-categories")
      .then(setCategories)
      .catch(() => {});
    api
      .get<Brand[]>("/brands")
      .then(setBrands)
      .catch(() => {});
  }, []);

  useEffect(() => {
    void loadProducts(1);
  }, [filterCategoryId, filterBrandId, searchName]);

  const openCreate = () => {
    setEditId(null);
    form.resetFields();
    form.setFieldsValue({ stock: 0 });
    setVisible(true);
  };

  const openEdit = (p: Product) => {
    setEditId(p.id);
    form.setFieldsValue({
      categoryId: p.categoryId,
      brandId: p.brandId || undefined,
      name: p.name,
      costPrice: toInputNumber(p.costPrice),
      sellPrice: toInputNumber(p.sellPrice),
      stock: p.stock,
    });
    setVisible(true);
  };

  const submit = async () => {
    try {
      const values = await form.validate();
      if (!values.brandId) {
        Message.error("请选择品牌");
        return;
      }
      const body = {
        categoryId: values.categoryId,
        brandId: values.brandId,
        name: values.name,
        costPrice:
          values.costPrice === "" || values.costPrice === undefined
            ? null
            : values.costPrice,
        sellPrice:
          values.sellPrice === "" || values.sellPrice === undefined
            ? null
            : values.sellPrice,
        stock: values.stock ?? 0,
      };
      if (editId) await api.patch(`/products/${editId}`, body);
      else await api.post("/products", body);
      Message.success(editId ? "已更新" : "已创建");
      setVisible(false);
      void loadProducts(page);
    } catch (e) {
      if (e && typeof e === "object" && "error" in e) return;
      Message.error(errMessage(e));
    }
  };

  const filteredBrands = categoryId
    ? brands.filter((b) => !b.categoryId || b.categoryId === categoryId)
    : brands;

  const filterBrandOptions = filterCategoryId
    ? brands.filter((b) => !b.categoryId || b.categoryId === filterCategoryId)
    : brands;

  const resetFilters = () => {
    setFilterCategoryId(undefined);
    setFilterBrandId(undefined);
    setSearchName("");
    setSearchInputKey((k) => k + 1);
  };

  return (
    <>
      <h1 className="page-title">商品入库</h1>
      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 12,
          }}
        >
          <Space wrap align="end">
            <Select
              key="filter-category"
              style={{ width: 160 }}
              placeholder="筛选分类"
              allowClear
              value={filterCategoryId}
              onChange={(v) => {
                setFilterCategoryId(v);
                if (filterBrandId && v) {
                  const brand = brands.find((b) => b.id === filterBrandId);
                  if (brand?.categoryId && brand.categoryId !== v) {
                    setFilterBrandId(undefined);
                  }
                }
              }}
            >
              {categories.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name}
                </Select.Option>
              ))}
            </Select>
            <Select
              key="filter-brand"
              style={{ width: 160 }}
              placeholder="筛选品牌"
              allowClear
              value={filterBrandId}
              onChange={setFilterBrandId}
            >
              {filterBrandOptions.map((b) => (
                <Select.Option key={b.id} value={b.id}>
                  {b.name}
                </Select.Option>
              ))}
            </Select>
            <Input.Search
              key={`product-name-${searchInputKey}`}
              style={{ width: 200 }}
              placeholder="商品名称"
              allowClear
              onSearch={setSearchName}
            />
            <Button key="reset-filters" onClick={resetFilters}>
              重置
            </Button>
          </Space>
          <Button
            type="primary"
            onClick={openCreate}
            style={{ marginLeft: "auto" }}
          >
            新建商品
          </Button>
        </div>
      </Card>
      <Table
        loading={loading}
        rowKey={(record) => record.id}
        data={list}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: paginationTotal(page, PAGE_SIZE, list.length, hasMore),
          showTotal: true,
          onChange: (p) => void loadProducts(p),
        }}
        columns={[
          { key: "category", title: "分类", render: (_, r) => r.category?.name },
          { key: "brand", title: "品牌", render: (_, r) => r.brand?.name || "-" },
          { key: "name", title: "名称", dataIndex: "name" },
          { key: "costPrice", title: "成本价", dataIndex: "costPrice", render: formatMoney },
          { key: "sellPrice", title: "售卖价", dataIndex: "sellPrice", render: formatMoney },
          { key: "stock", title: "库存", dataIndex: "stock" },
          {
            key: "actions",
            title: "操作",
            render: (_, row) => (
              <Space>
                <Button key="edit" size="small" onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Button
                  key="delete"
                  size="small"
                  status="danger"
                  onClick={() =>
                    confirmDelete({
                      onDelete: () => api.delete(`/products/${row.id}`),
                      onSuccess: () => void loadProducts(page),
                    })
                  }
                >
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editId ? "编辑商品" : "新建商品"}
        visible={visible}
        onOk={submit}
        onCancel={() => setVisible(false)}
        style={{ width: 520 }}
        unmountOnExit
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="分类"
            field="categoryId"
            rules={[{ required: true }]}
          >
            <Select
              onChange={() => form.setFieldsValue({ brandId: undefined })}
            >
              {categories.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="品牌"
            field="brandId"
            rules={[{ required: true, message: "请选择品牌" }]}
          >
            <Select placeholder="请选择品牌">
              {filteredBrands.map((b) => (
                <Select.Option key={b.id} value={b.id}>
                  {b.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="名称" field="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="成本价（可选）" field="costPrice">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="售卖价（可选）" field="sellPrice">
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="库存" field="stock">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
