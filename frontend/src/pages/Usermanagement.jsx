import { useState, useEffect, useMemo} from "react";
import api from "../axios";

const roles = ["TENANT", "ADMIN", "MANAGER"];

function useDebounced(value, delay = 300) {
    const [debounced, setDebounced] = useState(value)
    useEffect(() => {
      const t = setTimeout(() => setDebounced(value), delay)
      return () => clearTimeout(t);
    }, [value, delay])
    return debounced;
}

const Usermanagement = () => {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ username: "", email: "", role: "TENANT", phone: "", full_name: "" });
  const [saving, setSaving] = useState(false)

  const [message, setMessage] = useState("");

  const [searchQuery, setSearchQuery] = useState("")
  const [filterRole, setFilterRole] = useState("all")
  const [sortBy, setSortBy] = useState("id")
  const [sortOrder, setSortOrder] = useState("asc")

  const debouncedQuery = useDebounced(searchQuery, 300);

  const currentRole = (localStorage.getItem("role") || "").toUpperCase();
  const canModify = currentRole === "ADMIN";


  useEffect(() => {
    if (!["ADMIN", "MANAGER"].includes(currentRole)) {
      setError("Access denied");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await api.get("/users");
        setUsers(res.data || []);
        setError("");
      } catch (err) {
        setError(
          err?.response?.data?.message ||
            err?.response?.data?.error ||
            "Access denied"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [currentRole]);

  const startEdit = (u) => {
    if (!canModify) return;
    setEditingId(u.id);
    setForm({
      username: u.username || "",
      email: u.email || "",
      role: u.role || "TENANT",
      phone: u.phone || "",
      full_name: u.full_name || "",
    });
    setMessage("");
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ username: "", email: "", role: "TENANT", phone: "", full_name: "" });
  };

  const saveEdit = async (userId) => {
    setSaving(true);
    try{
      const payload = {
        username: form.username?.trim() || undefined,
        email: form.email?.trim() || undefined,
        role: form.role,
        phone: form.phone?.trim(),
        full_name: form.full_name?.trim() || null,
      };
      if (!payload.phone || payload.phone.length < 6) {
        setSaving(false);
        setError("Phone number is required");
        return;
      }
      const res = await api.patch(`/users/${userId}`, payload)
      const updatedUser = res?.data ?? { id: userId, ...form };

      setUsers((prev) =>
      prev.map((x) => (x.id === userId ? { ...x, ...updatedUser } : x)))
      setMessage("Saved successfully.")
      setError("");
      setEditingId(null);
      setForm({ username: "", email: "", role: "TENANT", phone: "", full_name: ""})

    } catch (err) {
      setMessage("");
      setError(
        err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "Save failed"
      )
    } finally {
      setSaving(false);
    }
  }

  const handleDelete = async (id) => {
    if (!canModify) return;
    if (!window.confirm("Confirm delete this user?"))
      return;

    try {
      await api.delete(`/users/${id}`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      alert("Delete Successfully")
    } catch (err) {
      alert(err.response?.data?.message || "Cannot delete");
    }
  }

  const handleResetPassword = async (id) => {
    if (!canModify) return;
    const newPassword = window.prompt("Enter new password (min 8 characters)");
    if (!newPassword) return;
    if (newPassword.length < 8) {
      alert("Password must be at least 8 characters");
      return;
    }
    try {
      await api.post(`/users/${id}/reset-password`, { new_password: newPassword });
      alert("Password has been reset");
    } catch (err) {
      alert(err.response?.data?.message || "Reset failed");
    }
  };


  

  const viewUsers = useMemo(() => {
    let list = users

    if (filterRole !== "all") {
      list = list.filter(u => u.role === filterRole)
    }

    const q = debouncedQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(u => {
        const name = (u.username || "").toLowerCase()
        const email = (u.email || "").toLowerCase()
        return name.includes(q) || email.includes(q)
      })
    }

    const dir = sortOrder === "asc" ? 1 : -1;
    const getter = (u) => {
      if (sortBy === "username" || sortBy === "email" || sortBy === "role") {
        return String(u[sortBy] || "").toLowerCase()
      }
      return String(u.id || "");
    }

    return [...list].sort((a,b) => {
      const av = getter(a)
      const bv = getter(b)
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;

      return String(a.id || "").localeCompare(String(b.id || "")) * dir;
    })
  }, [users, filterRole, debouncedQuery, sortBy, sortOrder])

  if (loading) {
    return <div className="p-4">Loading users…</div>;
  }


  
  return (
    <div className="p-4">
      <h2 className="pb-2 text-lg font-semibold">Usermanagement</h2>

      {message && <div className="mb-2 text-green-600 text-sm">{message}</div>}
      {!canModify && !error && (
        <div className="mb-2 text-sm text-amber-600">Managers can view users but cannot modify their details.</div>
      )}
      {error ? (
        <p className="text-red-500">{error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[640px] border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="border-b p-2 text-left">ID</th>
                <th className="border-b p-2 text-left">Username</th>
                <th className="border-b p-2 text-left">Email</th>
                <th className="border-b p-2 text-left">Full Name</th>
                <th className="border-b p-2 text-left">Phone</th>
                <th className="border-b p-2 text-left">Role</th>
                <th className="border-b p-2 text-left">Control</th>
              </tr>
            </thead>
            <tbody>
              {users.length > 0 ? (
                users.map((u) => {
                  const isEditing = editingId === u.id;
                  return (
                    <tr key={u.id} className="odd:bg-white even:bg-gray-50">
                      <td className="border-b p-2">{u.id}</td>

                      {/* Username */}
                      <td className="border-b p-2">
                        {isEditing ? (
                          <input
                            value={form.username}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                username: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          u.username
                        )}
                      </td>

                      {/* Email */}
                      <td className="border-b p-2">
                        {isEditing ? (
                          <input
                            value={form.email}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, email: e.target.value }))
                            }
                          />
                        ) : (
                          u.email
                        )}
                      </td>

                      {/* Full Name */}
                      <td className="border-b p-2">
                        {isEditing ? (
                          <input
                            value={form.full_name}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, full_name: e.target.value }))
                            }
                          />
                        ) : (
                          u.full_name || "-"
                        )}
                      </td>

                      {/* Phone */}
                      <td className="border-b p-2">
                        {isEditing ? (
                          <input
                            value={form.phone}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, phone: e.target.value }))
                            }
                          />
                        ) : (
                          u.phone
                        )}
                      </td>

                      {/* Role */}
                      <td className="border-b p-2">
                        {isEditing ? (
                          <select
                            value={form.role}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, role: e.target.value }))
                            }
                          >
                            {roles.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          u.role
                        )}
                      </td>

                      {/* Control */}
                      <td className="border-b p-2">
                        {canModify ? (
                          isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => saveEdit(u.id)}
                                disabled={saving}
                                className="px-2 py-1 rounded border border-indigo-600 bg-indigo-600 text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Save
                              </button>
                              <button type="button" onClick={cancelEdit} className="px-2 py-1 border rounded">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => startEdit(u)} className="px-2 py-1 border rounded">Edit</button>
                              <button type="button" onClick={() => handleResetPassword(u.id)} className="px-2 py-1 border rounded border-blue-400 text-blue-600">Reset Password</button>
                              <button type="button" onClick={() => handleDelete(u.id)} className="px-2 py-1 border rounded border-red-400 text-red-600">Delete</button>
                            </div>
                          )
                        ) : (
                          <span className="text-gray-400">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="p-3" colSpan={7}>
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Usermanagement;
