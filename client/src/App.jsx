import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import CatalogueHome from './pages/public/CatalogueHome.jsx';
import DivisionProducts from './pages/public/DivisionProducts.jsx';
import ProductDetails from './pages/public/ProductDetails.jsx';
import { SiteLayout } from './components/layout/SiteLayout.jsx';
import { GuestOnlyRoute, ProtectedRoute } from './components/auth/ProtectedRoute.jsx';
import { AdminRoute } from './components/auth/AdminRoute.jsx';

const Register = lazy(() => import('./pages/public/Register.jsx'));
const Login = lazy(() => import('./pages/public/Login.jsx'));
const CustomerDashboard = lazy(() => import('./pages/customer/CustomerDashboard.jsx'));
const CustomerProfile = lazy(() => import('./pages/customer/CustomerProfile.jsx'));
const CustomerOrders = lazy(() => import('./pages/customer/CustomerOrders.jsx'));
const OrderDetails = lazy(() => import('./pages/customer/OrderDetails.jsx'));
const CartPage = lazy(() => import('./pages/customer/CartPage.jsx'));
const CheckoutPage = lazy(() => import('./pages/customer/CheckoutPage.jsx'));
const AdminProofManagement = lazy(() => import('./pages/admin/AdminProofManagement.jsx'));
const AdminTemplates = lazy(() => import('./pages/admin/AdminTemplates.jsx'));
const SavedDesigns = lazy(() => import('./pages/customer/SavedDesigns.jsx'));
const DesignerPage = lazy(() => import('./pages/customer/DesignerPage.jsx'));
const VariableDataPage = lazy(() => import('./pages/customer/VariableDataPage.jsx'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports.jsx'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments.jsx'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts.jsx'));
const OrderReceipt = lazy(() => import('./pages/customer/OrderReceipt.jsx'));

function NotFoundPage() {
  return <SiteLayout><main className="catalogue-page page-gutter"><p className="eyebrow">404 / PAGE NOT FOUND</p><h1>This page isn’t<br /><em>in the workshop.</em></h1><a className="text-link" href="/">Return to the catalogue <span>↗</span></a></main></SiteLayout>;
}

export default function App() {
  return (
    <Suspense fallback={<main className="catalogue-page page-gutter"><div className="request-state" role="status">Loading your account…</div></main>}><Routes>
      <Route path="/" element={<CatalogueHome />} />
      <Route path="/catalogue/:divisionSlug" element={<DivisionProducts />} />
      <Route path="/catalogue/:divisionSlug/:productSlug" element={<ProductDetails />} />
      <Route path="/register" element={<GuestOnlyRoute><Register /></GuestOnlyRoute>} />
      <Route path="/login" element={<GuestOnlyRoute><Login /></GuestOnlyRoute>} />
      <Route element={<ProtectedRoute />}>
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/account" element={<CustomerDashboard />} />
        <Route path="/account/profile" element={<CustomerProfile />} />
        <Route path="/account/orders" element={<CustomerOrders />} />
        <Route path="/account/orders/:orderId" element={<OrderDetails />} />
        <Route path="/account/orders/:orderId/receipt" element={<OrderReceipt />} />
        <Route path="/account/designs" element={<SavedDesigns />} />
        <Route path="/account/designer" element={<DesignerPage />} />
        <Route path="/account/designer/:designId" element={<DesignerPage />} />
        <Route path="/account/variable-data" element={<VariableDataPage />} />
        <Route path="/admin/proofs" element={<AdminRoute><AdminProofManagement /></AdminRoute>} />
        <Route path="/admin/templates" element={<AdminRoute><AdminTemplates /></AdminRoute>} />
        <Route path="/admin/products" element={<AdminRoute><AdminProducts /></AdminRoute>} />
        <Route path="/admin/reports" element={<AdminRoute><AdminReports /></AdminRoute>} />
        <Route path="/admin/payments" element={<AdminRoute><AdminPayments /></AdminRoute>} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes></Suspense>
  );
}
