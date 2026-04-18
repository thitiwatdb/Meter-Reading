import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Form, Input, Button, Space, Typography, Alert } from "antd";
import api from "../axios";

const { Title, Text } = Typography;

const Register = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleRegister = async (values) => {
    try {
      setLoading(true);
      const { username, password, email, phone } = values;
      const userData = {
        username: username.trim(),
        password,
        email: email.trim(),
        phone: phone.trim(),
      };

      await api.post("/auth/register", userData);
      setFeedback({
        type: "success",
        message: "Account created",
        description: "Your DormSys account is ready to use.",
      });
      form.resetFields();
      setTimeout(() => navigate("/"), 1500);
    } catch (err) {
      console.error("Register error:", err);
      const errorMessage =
        err.response?.data?.message || "Register failed. Please try again.";
      setFeedback({
        type: "error",
        message: "Registration failed",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "64px 16px",
        }}
      >
        <Card
          style={{
            width: "100%",
            maxWidth: 480,
            borderRadius: 16,
            boxShadow: "0 24px 48px rgba(15, 23, 42, 0.12)",
          }}
          styles={{
            body: {
              padding: "40px 36px",
            },
          }}
          variant="filled"
        >
          <Space direction="vertical" size={24} style={{ width: "100%" }}>
            {feedback && (
              <Alert
                showIcon
                closable
                type={feedback.type}
                message={feedback.message}
                description={feedback.description}
                onClose={() => setFeedback(null)}
              />
            )}
            <div>
              <Title level={3} style={{ marginBottom: 8 }}>
                Create your account
              </Title>
              <Text type="secondary">
                Fill in the details below to get started with DormSys.
              </Text>
            </div>
            <Form
              layout="vertical"
              form={form}
              onFinish={handleRegister}
              requiredMark={false}
            >
              <Form.Item
                name="username"
                label="Username"
                rules={[
                  { required: true, message: "Please enter username" },
                  {
                    min: 3,
                    message: "Username must be at least 3 characters",
                  },
                ]}
                normalize={(value) => value?.trimStart() ?? value}
              >
                <Input size="large" placeholder="Enter username" />
              </Form.Item>

              <Form.Item
                name="password"
                label="Password"
                rules={[
                  { required: true, message: "Please enter password" },
                  {
                    min: 6,
                    message: "Password must be at least 6 characters",
                  },
                ]}
              >
                <Input.Password size="large" placeholder="Enter password" />
              </Form.Item>

              <Form.Item
                name="confirmPassword"
                label="Confirm Password"
                dependencies={["password"]}
                rules={[
                  { required: true, message: "Please confirm your password" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("password") === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(
                        new Error("Passwords do not match")
                      );
                    },
                  }),
                ]}
              >
                <Input.Password size="large" placeholder="Re-enter password" />
              </Form.Item>

              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: "Please enter email" },
                  {
                    type: "email",
                    message: "Please enter a valid email address",
                  },
                ]}
                normalize={(value) => value?.trim() ?? value}
              >
                <Input size="large" placeholder="mut888@mut.ac.th" />
              </Form.Item>

              <Form.Item
                name="phone"
                label="Phone"
                rules={[
                  { required: true, message: "Please enter phone number" },
                  () => ({
                    validator(_, value) {
                      if (!value || value.trim().length >= 6) {
                        return Promise.resolve();
                      }
                      return Promise.reject(
                        new Error("Phone number is too short")
                      );
                    },
                  }),
                ]}
                normalize={(value) => value?.trimStart() ?? value}
              >
                <Input size="large" type="tel" pattern="[0-9]{10}" placeholder="Enter phone number" required/>
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  block
                  loading={loading}
                  style={{
                    borderRadius: 10,
                    boxShadow: "0 12px 24px rgba(22, 119, 255, 0.35)",
                    fontWeight: 600,
                  }}
                >
                  Create account
                </Button>
              </Form.Item>
            </Form>
          </Space>
        </Card>
      </div>
    </>
  );
};

export default Register;
