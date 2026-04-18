import { useEffect, useState } from 'react';
import api from '../axios';

const emptyProfile = {
  username: '',
  full_name: '',
  email: '',
  phone: '',
  role: '',
};

const mapProfile = (data = {}) => ({
  username: data.username || '',
  full_name: data.full_name || '',
  email: data.email || '',
  phone: data.phone || '',
  role: (data.role || '').toUpperCase(),
});

export default function Profile() {
  const [profile, setProfile] = useState(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    current: '',
    next: '',
    confirm: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const loadProfile = async () => {
    setLoading(true);
    setProfileError('');
    try {
      const res = await api.get('/users/me');
      setProfile(mapProfile(res.data || {}));
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Unable to load your profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleProfileChange = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setSavingProfile(true);
    try {
      const res = await api.patch('/users/me', {
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
      });
      setProfile(mapProfile(res.data || {}));
      setProfileSuccess('Changes saved successfully.');
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Unable to update your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleProfileReset = () => {
    setProfileSuccess('');
    setProfileError('');
    loadProfile();
  };

  const handlePasswordChange = (field, value) => {
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordForm.next || passwordForm.next.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await api.post('/users/me/change-password', {
        current_password: passwordForm.current,
        new_password: passwordForm.next,
      });
      setPasswordSuccess('Password updated successfully.');
      setPasswordForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Unable to change your password.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
        <p className="font-semibold">Before you edit</p>
        <p className="mt-1">
          Please review your contact details before saving so our staff can reach you quickly for confirmations or urgent notices.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Profile information</h2>
            <p className="text-sm text-slate-500">Update your personal and contact details.</p>
      </div>
          {profile.role && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
              {profile.role}
            </span>
          )}
        </div>

        {profileError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {profileError}
          </div>
        )}
        {profileSuccess && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {profileSuccess}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleProfileSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-600">Username</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500"
              value={profile.username}
              disabled
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-600">Full name</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={profile.full_name}
                onChange={(e) => handleProfileChange('full_name', e.target.value)}
                placeholder="How should we address you?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">Phone number</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={profile.phone}
                onChange={(e) => handleProfileChange('phone', e.target.value)}
                placeholder="08X-XXX-XXXX"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600">Email</label>
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={profile.email}
              onChange={(e) => handleProfileChange('email', e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              onClick={handleProfileReset}
              disabled={savingProfile}
            >
              Reset
            </button>
            <button
              type="submit"
              className="rounded-xl border border-indigo-600 bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
          <p className="text-sm text-slate-500">Set a new password to keep your account secure.</p>
        </div>

        {passwordError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {passwordError}
          </div>
        )}
        {passwordSuccess && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {passwordSuccess}
          </div>
        )}

        <form className="space-y-4" onSubmit={handlePasswordSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-600">Current password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={passwordForm.current}
              onChange={(e) => handlePasswordChange('current', e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-600">New password</label>
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={passwordForm.next}
                onChange={(e) => handlePasswordChange('next', e.target.value)}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">Confirm new password</label>
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={passwordForm.confirm}
                onChange={(e) => handlePasswordChange('confirm', e.target.value)}
                placeholder="Type the same password again"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="submit"
              className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow hover:bg-slate-50 disabled:opacity-60"
              disabled={savingPassword}
            >
              {savingPassword ? 'Updating…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
