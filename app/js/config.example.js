/* Firebase 設定の雛形。このファイルを js/config.js にコピーし、Firebaseコンソールの「プロジェクトの設定 > マイアプリ > SDK の設定と構成」の値を貼る。
   Realtime Database を作成し、ルールは当面（親しい人だけで使う前提）:
   { "rules": { "rooms": { "$code": { ".read": true, ".write": true } } } }
   ※ config.js は公開されても動作上の秘密ではない（DBルールで守る）。 */
window.G1_FIREBASE = {
  apiKey: "",
  authDomain: "",
  databaseURL: "https://<project-id>-default-rtdb.firebaseio.com",
  projectId: "",
  appId: "",
};
