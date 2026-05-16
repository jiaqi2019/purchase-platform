import { Layout, Menu } from '@arco-design/web-react';
import { IconUser, IconTag, IconStorage, IconList, IconTrophy, IconCalendar } from '@arco-design/web-react/icon';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import BuyersPage from './pages/buyers-page';
import CategoriesPage from './pages/categories-page';
import BrandsPage from './pages/brands-page';
import ProductsPage from './pages/products-page';
import ConsumptionListPage from './pages/consumption-list-page';
import LeaderboardPage from './pages/leaderboard-page';
import BirthdayRemindersPage from './pages/birthday-reminders-page';

const { Sider, Content } = Layout;

const menuItems = [
  { key: '/buyers', label: '购买者', icon: <IconUser /> },
  { key: '/categories', label: '商品分类', icon: <IconTag /> },
  { key: '/brands', label: '品牌', icon: <IconTag /> },
  { key: '/products', label: '商品入库', icon: <IconStorage /> },
  { key: '/purchases', label: '消费列表', icon: <IconList /> },
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
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/brands" element={<BrandsPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/purchases" element={<ConsumptionListPage />} />
            <Route path="/purchases/*" element={<Navigate to="/purchases" replace />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/birthday-reminders" element={<BirthdayRemindersPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
