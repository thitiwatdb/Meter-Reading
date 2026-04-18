import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import Home from "./pages/Home";
import Register from "./pages/Register";
import Usermanagement from "./pages/Usermanagement";
import Roommanagement from "./pages/Roommanagement";
import RoomBrowser from "./pages/RoomBrowser";
import Bookingmanagement from "./pages/Bookingmanagement";
import TenancyManagement from "./pages/TenancyManagement";
import Dashboard from "./pages/Dashboard";
import Meters from "./pages/Meters";
import Maintenance from "./pages/Maintenance";
import BillingPayments from "./pages/BillingPayments";
import OnlineBooking from "./pages/OnlineBooking";
import Settings from "./pages/Settings";
import ActivityLog from "./pages/ActivityLog";
import MyBookings from "./pages/MyBookings";
import MyBilling from "./pages/MyBilling";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="register" element={<Register/>}/>
          <Route path="usermanagement" element={<Usermanagement/>}/>
          <Route path="roommanagement" element={<Roommanagement/>}/>
          <Route path="browse-rooms" element={<RoomBrowser/>}/>
          <Route path="bookingmanagement" element={<Bookingmanagement/>}/>
          <Route path="tenancymanagement" element={<TenancyManagement/>}/>
          <Route path="dashboard" element={<Dashboard/>}/>
          <Route path="meters" element={<Meters/>}/>
          <Route path="maintenance" element={<Maintenance/>}/>
          <Route path="billing-payments" element={<BillingPayments/>}/>
          <Route path="online-booking" element={<OnlineBooking/>}/>
          <Route path="my-bookings" element={<MyBookings/>}/>
          <Route path="my-billing" element={<MyBilling/>}/>
          <Route path="notifications" element={<Notifications/>}/>
          <Route path="profile" element={<Profile/>}/>
          <Route path="settings" element={<Settings/>}/>
          <Route path="activity" element={<ActivityLog/>}/>
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
