# 🌐 SyncSys.cloud Custom Router Firmware Builder

Automated cloud compilation repository for **SyncSys.cloud OS** — high-performance, enterprise-grade custom OpenWrt/ImmortalWrt firmware tailored for MediaTek MT7621 routers.

---

## 🚀 Supported Devices in this Builder

| Hardware Model | CPU / SoC | Flash Layout | Output Firmware |
| :--- | :--- | :--- | :--- |
| **Xiaomi Mi Router CR6609 / CR6606 / CR6608** | MediaTek MT7621AT | 128 MB NAND (PB-Boot layout) | `SyncSys-CR660x-Firmware.bin` |
| **Qihoo 360T6GS** | MediaTek MT7621AT | 128 MB NAND (Qihoo layout) | `SyncSys-360T6GS-Firmware.bin` |

---

## ✨ Features Pre-Configured for SyncSys.cloud OS

1. **Branding & Identity:**
   - Distribution Name: **SyncSys.cloud OS**
   - Version: **v1.0 LTS**
   - Welcome terminal banner with custom SyncSys ASCII art.
   - Clean dark UI powered by **Argon Theme**.

2. **Network & ISP Optimizations:**
   - **Multi-WAN & Load Balancing (`luci-app-mwan3`)**: Combine multiple internet lines with automatic failover.
   - **Smart Queue Management (`luci-app-sqm`)**: Anti-bufferbloat & gaming latency optimizer (CAKE / FQ-CoDel).
   - **Ping Watchdog (`luci-app-watchcat`)**: Automatic recovery reboot if internet connection drops.

3. **VPN & Remote Cloud Access:**
   - **WireGuard (`luci-app-wireguard`)**: High-speed, modern encrypted VPN tunnels.
   - **OpenVPN (`luci-app-openvpn`)**: Standard client and server support.
   - **ZeroTier (`luci-app-zerotier`)**: Cloud mesh P2P overlay networking.
   - **EOIP (`luci-app-eoip`)**: Ethernet-over-IP Mikrotik-compatible tunnels.

4. **Wireless & Performance:**
   - Unlocked MediaTek MT7915 Wi-Fi 6 drivers with optimized transmission tables.
   - Channel interference analysis & real-time bandwidth monitor.

---

## 🛠️ How to Build Your Firmware (3 Simple Steps)

### Step 1: Create a GitHub Repository
1. Go to [GitHub](https://github.com) and create a new repository (e.g. `syncsys-os` or `syncsys-firmware`).
2. Clone or push all files from this directory to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initialize SyncSys.cloud firmware builder"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

### Step 2: Trigger the Cloud Build
1. On your GitHub repository page, click the **Actions** tab at the top.
2. In the left sidebar, click **"Build SyncSys.cloud Firmware"**.
3. Click the **"Run workflow"** button on the right, select which router you want to build (or build both!), and click **Run**.

### Step 3: Download Your Ready-to-Flash Firmware
1. GitHub's cloud servers will compile the kernel, packages, and filesystem (~1.5 hours).
2. When completed:
   - Go to the workflow run summary to download the `.bin` file under **Artifacts**.
   - Or download directly from the automated **Releases** tab with checksums included!
