import http from 'k6/http';

export let options = {
  vus: 120,
  duration: '30s',
};
export default function () {
  http.get('http://localhost:3000/myroute');
}
