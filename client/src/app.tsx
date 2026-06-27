import { Layout, Menu } from '@arco-design/web-react';
import { IconUser, IconTag, IconStorage, IconList, IconTrophy, IconCalendar, IconTool, IconGift, IconSwap } from '@arco-design/web-react/icon';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import BuyersPage from './pages/buyers-page';
import PurchaseChannelsPage from './pages/purchase-channels-page';
import CategoriesPage from './pages/categories-page';
import BrandsPage from './pages/brands-page';
import ProductModelsPage from './pages/product-models-page';
import ProductModelCreatePage from './pages/product-model-create-page';
import StockInPage from './pages/stock-in-page';
import StockInCreatePage from './pages/stock-in-create-page';
import StockOutCreatePage from './pages/stock-out-create-page';
import StockInDetailPage from './pages/stock-in-detail-page';
import InventoryPage from './pages/inventory-page';
import ConsumptionListPage from './pages/consumption-list-page';
import AfterSalesPage from './pages/after-sales-page';
import RepairOrdersPage from './pages/repair-orders-page';
import ServiceCardsPage from './pages/service-cards-page';
import ProfitReportPage from './pages/profit-report-page';
import LeaderboardPage from './pages/leaderboard-page';
import BirthdayRemindersPage from './pages/birthday-reminders-page';

const { Sider, Content } = Layout;

const menuItems = [
  { key: '/buyers', label: '购买者', icon: <IconUser /> },
  { key: '/purchase-channels', label: '采购渠道', icon: <IconTag /> },
  { key: '/categories', label: '商品分类', icon: <IconTag /> },
  { key: '/brands', label: '品牌', icon: <IconTag /> },
  { key: '/models', label: '型号规格', icon: <IconTag /> },
  { key: '/stock-in', label: '出入库', icon: <IconStorage /> },
  { key: '/inventory', label: '库存查询', icon: <IconStorage /> },
  { key: '/purchases', label: '订单列表', icon: <IconList /> },
  { key: '/after-sales', label: '售后订单', icon: <IconSwap /> },
  { key: '/repairs', label: '维修订单', icon: <IconTool /> },
  { key: '/service-cards', label: '次卡服务', icon: <IconGift /> },
  { key: '/profit-report', label: '财务管理', icon: <IconList /> },
  { key: '/leaderboard', label: '消费排行', icon: <IconTrophy /> },
  { key: '/birthday-reminders', label: '生日提醒', icon: <IconCalendar /> },
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const selected = menuItems.find((m) => location.pathname.startsWith(m.key))?.key ?? '/buyers';

  return (
    <Layout className="app-layout">
      <Sider className="app-sider" width={200}>
        <div className="app-brand">
          <img src="/logo-icon.png" alt="" className="app-brand__icon" />
          <span className="app-brand__title">优品管理</span>
        </div>
        <Menu selectedKeys={[selected]} onClickMenuItem={(key) => navigate(key)}>
          {menuItems.map((m) => (
            <Menu.Item key={m.key}>
              {m.icon}
              {m.label}
            </Menu.Item>
          ))}
        </Menu>
      </Sider>
      <Layout>
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/buyers" replace />} />
            <Route path="/buyers" element={<BuyersPage />} />
            <Route path="/purchase-channels" element={<PurchaseChannelsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/brands" element={<BrandsPage />} />
            <Route path="/models" element={<ProductModelsPage />} />
            <Route path="/models/new" element={<ProductModelCreatePage />} />
            <Route path="/stock-in" element={<StockInPage />} />
            <Route path="/stock-in/new" element={<StockInCreatePage />} />
            <Route path="/stock-in/out/new" element={<StockOutCreatePage />} />
            <Route path="/stock-in/:id" element={<StockInDetailPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/purchases" element={<ConsumptionListPage />} />
            <Route path="/purchases/*" element={<Navigate to="/purchases" replace />} />
            <Route path="/after-sales" element={<AfterSalesPage />} />
            <Route path="/repairs" element={<RepairOrdersPage />} />
            <Route path="/service-cards" element={<ServiceCardsPage />} />
            <Route path="/profit-report" element={<ProfitReportPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/birthday-reminders" element={<BirthdayRemindersPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
