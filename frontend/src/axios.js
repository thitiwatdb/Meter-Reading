import axios from 'axios'

const instance = axios.create({
    baseURL: 'http://localhost:5000/api',
    withCredentials: false,
});

instance.interceptors.request.use((config) => {
    const t = localStorage.getItem("token");
    if(t) config.headers.Authorization = `Bearer ${t}`;
    return config;
});

export default instance;