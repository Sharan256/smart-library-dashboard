import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, demoUsers } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('student');
  const [username, setUsername] = useState('student');
  const [password, setPassword] = useState('student123');
  const [error, setError] = useState('');

  const handleRoleChange = (nextRole) => {
    setRole(nextRole);
    setUsername(demoUsers[nextRole].username);
    setPassword(demoUsers[nextRole].password);
    setError('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    try {
      const user = login(username, password, role);
      if (user.role === 'student') {
        navigate('/student');
      } else if (user.role === 'assistant') {
        navigate('/assistant');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-page">
      <div className="login-panel card">
        <div>
          <h1>Smart Library Analytics</h1>
          <p>
            Login as a student to explore study-friendly spaces, or as a library assistant to monitor operations,
            usage patterns, alerts, and planning insights.
          </p>
        </div>

        <div className="role-switcher">
          <button type="button" className={role === 'student' ? 'active' : ''} onClick={() => handleRoleChange('student')}>
            Student
          </button>
          <button type="button" className={role === 'assistant' ? 'active' : ''} onClick={() => handleRoleChange('assistant')}>
            Library Assistant
          </button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit" className="primary-btn">Login</button>
          {error ? <div className="error-text">{error}</div> : null}
        </form>

      </div>
    </div>
  );
}
