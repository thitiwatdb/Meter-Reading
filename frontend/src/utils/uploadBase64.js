export async function uploadBase64(contentBase64, filename = undefined) {
  const token = localStorage.getItem('token');
  const res = await fetch('http://localhost:5000/api/uploads/base64', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ filename, contentBase64 }),
  });
  if (!res.ok) throw new Error('upload failed');
  return res.json(); // { path }
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

