# 🎨 Frontend Implementation Guide for RouteOps Dashboard

## **Overview**
This guide provides everything the frontend team needs to implement the RouteOps dashboard with all the new features and improvements we've added to the backend.

---

## **🔐 Authentication & User Management**

### **Login with Account Status Check**
```javascript
// Login function with disabled account handling
async function login(username, password) {
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (response.status === 401) {
      const error = await response.json();
      if (error.message.includes('disabled')) {
        throw new Error('Your account has been disabled. Please contact your administrator.');
      } else {
        throw new Error('Invalid username or password.');
      }
    }
    
    const userData = await response.json();
    localStorage.setItem('token', userData.accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
    return userData;
  } catch (error) {
    throw error;
  }
}
```

### **Forgot Password Flow**
```javascript
// Request password reset
async function forgotPassword(usernameOrEmail) {
  const response = await fetch('/api/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail })
  });
  
  const result = await response.json();
  
  // In development, show the reset token
  if (result.resetToken) {
    console.log('Reset token:', result.resetToken);
    // Show token to user for testing
  }
  
  return result.message;
}

// Reset password
async function resetPassword(token, newPassword) {
  const response = await fetch('/api/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return await response.json();
}
```

---

## **👥 User Management Dashboard**

### **User List Component**
```javascript
// Fetch users with entity alias
async function getUsers() {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/users', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const users = await response.json();
  
  // Each user now has both cityHall and entity fields
  // Use entity.name for display (same as cityHall.name)
  return users.map(user => ({
    ...user,
    entityName: user.entity?.name || user.cityHall?.name || 'No Entity',
    isActive: user.isActive !== false // Handle null as active
  }));
}
```

### **Create/Edit User Modal**
```javascript
// Unified modal for create and edit
function UserModal({ user, isEdit = false, onSave, onClose }) {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    password: '', // Always start with empty password
    role: user?.role || 'app_user',
    roles: user?.roles || ['app_user'],
    isActive: user?.isActive !== false,
    cityHallId: user?.cityHall?.id || user?.entity?.id || ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      const endpoint = isEdit ? `/api/users/${user.id}/update` : '/api/users/create-with-role';
      const method = isEdit ? 'PATCH' : 'POST';
      
      // Only send changed fields for edit
      const payload = isEdit 
        ? Object.fromEntries(
            Object.entries(formData).filter(([key, value]) => 
              value !== user[key] && value !== user[key.toLowerCase()]
            )
          )
        : formData;
      
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      
      onSave(await response.json());
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="text" 
        placeholder="Username"
        value={formData.username}
        onChange={(e) => setFormData({...formData, username: e.target.value})}
        required
      />
      
      <input 
        type="email" 
        placeholder="Email"
        value={formData.email}
        onChange={(e) => setFormData({...formData, email: e.target.value})}
      />
      
      <input 
        type="password" 
        placeholder={isEdit ? "New password (leave empty to keep current)" : "Password"}
        value={formData.password || ''}
        onChange={(e) => setFormData({...formData, password: e.target.value})}
        required={!isEdit}
      />
      
      <select 
        value={formData.role}
        onChange={(e) => setFormData({...formData, role: e.target.value})}
      >
        <option value="app_user">App User</option>
        <option value="dashboard_user">Dashboard User</option>
        <option value="admin">Admin</option>
      </select>
      
      <select 
        value={formData.cityHallId}
        onChange={(e) => setFormData({...formData, cityHallId: e.target.value})}
      >
        <option value="">Select Entity</option>
        {/* Populate with entities from /cityHalls/available */}
      </select>
      
      <label>
        <input 
          type="checkbox" 
          checked={formData.isActive}
          onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
        />
        Active (uncheck to disable login)
      </label>
      
      <button type="submit">
        {isEdit ? 'Update User' : 'Create User'}
      </button>
    </form>
  );
}
```

### **User Actions (Edit, Disable, Delete)**
```javascript
// Edit user (use the new endpoint that handles cityHallId and roles)
async function editUser(userId, updates) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api/users/${userId}/update`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return await response.json();
}

// Disable/Enable user
async function toggleUserStatus(userId, isActive) {
  return editUser(userId, { isActive });
}

// Delete user
async function deleteUser(userId) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api/users/${userId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return true;
}
```

### **Password Handling Notes**
- ✅ **Passwords are automatically hashed** before saving to database
- ✅ **Empty passwords are ignored** when editing users (keeps current password)
- ✅ **Only non-empty passwords are updated** to prevent accidental password changes
- ✅ **Use the `/users/:id/update` endpoint** for proper password handling

---

## **🏢 Entity Management**

### **Entity Dropdown (Admin Only)**
```javascript
// Get available entities for dropdowns
async function getAvailableEntities() {
  const token = localStorage.getItem('token');
  const response = await fetch('/cityHalls/available', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return await response.json();
}

// Update user's entity assignment (Admin only)
async function updateUserEntity(userId, entityId) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/users/${userId}/city-hall`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ cityHallId: entityId })
  });
  
  return await response.json();
}
```

---

## **📱 Mobile App Role Checking**

### **Role-Based Access Control**
```javascript
// Check if user can access mobile app
function canAccessMobileApp(user) {
  return user.role === 'app_user' || 
         (Array.isArray(user.roles) && user.roles.includes('app_user'));
}

// Check if user is admin
function isAdmin(user) {
  return user.role === 'admin' || 
         (Array.isArray(user.roles) && user.roles.includes('admin'));
}

// Check if user is dashboard user
function isDashboardUser(user) {
  return user.role === 'dashboard_user' || 
         (Array.isArray(user.roles) && user.roles.includes('dashboard_user'));
}

// Usage in mobile app
const user = JSON.parse(localStorage.getItem('user'));
if (!canAccessMobileApp(user)) {
  // Redirect to access denied page
  showAccessDenied('This app is only for field workers. Please contact your administrator.');
  logout();
}
```

---

## **🎯 Dashboard User Scoping**

### **Filter Users by Current User's Entity**
```javascript
// Dashboard users only see users from their entity
async function getFilteredUsers() {
  const token = localStorage.getItem('token');
  const currentUser = JSON.parse(localStorage.getItem('user'));
  
  if (isAdmin(currentUser)) {
    // Admin sees all users
    return getUsers();
  } else if (isDashboardUser(currentUser)) {
    // Dashboard user sees only app users from their entity
    const response = await fetch('/users/app-users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return await response.json();
  }
  
  return [];
}
```

---

## **🚨 Error Handling**

### **User-Friendly Error Messages**
```javascript
// Handle API errors with user-friendly messages
function handleApiError(error, response) {
  if (response?.status === 409) {
    if (error.message.includes('username')) {
      return 'A user with this username already exists. Please choose a different username.';
    } else if (error.message.includes('email')) {
      return 'A user with this email address already exists. Please use a different email.';
    }
  }
  
  if (response?.status === 401) {
    if (error.message.includes('disabled')) {
      return 'Your account has been disabled. Please contact your administrator.';
    }
    return 'Invalid username or password.';
  }
  
  return error.message || 'An unexpected error occurred.';
}
```

---

## **📋 Complete API Endpoints Reference**

### **Authentication**
- `POST /login` - Login (blocks disabled users)
- `POST /forgot-password` - Request password reset
- `POST /reset-password` - Reset password with token
- `GET /userInfo` - **NEW**: Get current user information

### **User Management**
- `GET /users` - List all users (with entity alias)
- `GET /users/:id` - Get single user
- `POST /users/create-with-role` - Create user (auto-hashes password)
- `PATCH /users/:id` - Edit user (disable with isActive: false)
- `PATCH /users/:id/update` - **NEW**: Update user with cityHallId and roles support
- `DELETE /users/:id` - Delete user
- `GET /users/profile` - Current user profile
- `GET /users/by-role/:role` - Users by role (admin only)
- `GET /users/dashboard-users` - Dashboard users (admin only)
- `GET /users/app-users` - App users (filtered by entity for dashboard users)
- `PATCH /users/:id/city-hall` - Update user's entity assignment (admin only)

### **Entity Management**
- `GET /cityHalls/available` - Available entities (admin only)
- `GET /users/dashboard/city-hall` - Dashboard user's entity (or all for admin)

---

## **🎨 UI/UX Recommendations**

### **User Status Indicators**
```css
.user-status-active { color: #22c55e; }
.user-status-disabled { color: #ef4444; }
.user-status-pending { color: #f59e0b; }
```

### **Entity Display**
- Show `entity.name` instead of `cityHall.name` in UI
- Use "Entity" instead of "City Hall" in labels
- Both fields contain the same data

### **Role Badges**
```javascript
function getRoleBadge(role) {
  const badges = {
    admin: { color: 'red', text: 'Admin' },
    dashboard_user: { color: 'blue', text: 'Dashboard' },
    app_user: { color: 'green', text: 'App User' }
  };
  return badges[role] || { color: 'gray', text: 'Unknown' };
}
```

---

## **🧪 Testing Credentials**

```javascript
// Test users for development
const testUsers = {
  admin: { username: 'admin', password: 'admin' },
  dashboard: { username: 'dash.lisbon', password: 'password123' },
  appUser: { username: 'app.lisbon', password: 'password123' }
};
```

---

## **📚 Key Changes Summary**

1. **✅ Login blocks disabled users** - Check for `isActive: false`
2. **✅ Entity alias** - Use `entity` field (same as `cityHall`)
3. **✅ Multiple roles** - Check `user.roles` array for mobile access
4. **✅ Readable errors** - Username/email conflicts show friendly messages
5. **✅ Forgot password** - New endpoints for password reset
6. **✅ User management** - Edit, disable, delete users
7. **✅ Entity scoping** - Dashboard users see only their entity's users

**Ready for frontend implementation!** 🚀
