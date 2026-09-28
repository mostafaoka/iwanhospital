const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(cors());

// قواعد بيانات الذاكرة المؤقتة (تتحول لقاعدة بيانات حقيقية PostgreSQL/MySQL لاحقاً)
let users = [];
let appointments = [];
let medicalRecords = [];

// 1. تسجيل مستخدم جديد أو مريض
app.post('/api/register', (req, res) => {
  const { full_name, email, phone, password, role, date_of_birth } = req.body;
  const exists = users.find(u => u.phone === phone);
  if (exists) return res.status(400).json({ success: false, message: 'رقم الموبايل مسجل مسبقاً' });

  const newUser = { id: users.length + 1, full_name, email, phone, password, role: role || 'patient', date_of_birth };
  users.push(newUser);
  res.json({ success: true, message: 'تم التسجيل بنجاح وإرسال OTP', user: newUser });
});

// 2. تسجيل الدخول
app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  const user = users.find(u => u.phone === phone && u.password === password);
  if (!user) return res.status(401).json({ success: false, message: 'خطأ في بيانات الدخول' });
  res.json({ success: true, message: 'تم الدخول بنجاح', user });
});

// 3. حجز موعد جلسة من المريض
app.post('/api/book-appointment', (req, res) => {
  const { patient_id, doctor_id, appointment_time, payment_method } = req.body;
  const appt = {
    id: appointments.length + 1,
    patient_id,
    doctor_id,
    appointment_time,
    payment_method,
    payment_status: 'pending', // في انتظار الاستقبال
    status: 'pending_reception'
  };
  appointments.push(appt);

  // إرسال تنبيه لحظي عبر الـ Socket.io للاستقبال والطبيب
  io.emit('new_appointment', appt);

  res.json({ success: true, message: 'تم الحجز بنجاح، في انتظار تأكيد الاستقبال والدفع', appt });
});

// 4. تأكيد الدفع الحصري من الاستقبال (شرط بدء الجلسة)
app.post('/api/confirm-payment', (req, res) => {
  const { appointment_id } = req.body;
  const appt = appointments.find(a => a.id == appointment_id);
  if (!appt) return res.status(404).json({ success: false, message: 'الحجز غير موجود' });

  appt.payment_status = 'paid';
  appt.status = 'confirmed';

  // إشعار المريض بأن الدفع تم وإصدار الإيصال
  io.emit(`patient_receipt_${appt.patient_id}`, {
    message: 'تم تأكيد الدفع وإصدار إيصال الجلسة بنجاح',
    receipt: { id: appt.id, time: appt.appointment_time, method: appt.payment_method }
  });

  res.json({ success: true, message: 'تم تأكيد الدفع وتفعيل الجلسة' });
});

// استقبال اتصالات الـ Socket
io.on('connection', (socket) => {
  console.log('مستخدم جديد متصل بالسيرفر:', socket.id);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`سيرفر مستشفى أيوان يعمل الآن على البورت ${PORT}`);
});