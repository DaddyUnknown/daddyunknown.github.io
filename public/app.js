// Telegram Web App Game - Main JavaScript File

class ClickerGame {
    constructor() {
        this.user = null;
        this.token = null;
        this.apiBase = '/api';
        this.currentTab = 'clicker';
        this.upgrades = [];
        this.businesses = [];
        this.autoIncomeInterval = null;
        
        this.init();
    }

    async init() {
        try {
            // Initialize Telegram Web App
            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.ready();
                window.Telegram.WebApp.expand();
            }

            // Setup event listeners
            this.setupEventListeners();
            
            // Try to login
            await this.login();
            
            // Load initial data
            await this.loadGameData();
            
            // Hide loading screen
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('game-container').style.display = 'block';
            
            // Start auto income collection
            this.startAutoIncomeCheck();
            
        } catch (error) {
            console.error('Initialization error:', error);
            this.showMessage('Ошибка инициализации игры', 'error');
        }
    }

    setupEventListeners() {
        // Navigation tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Click button
        const clickButton = document.getElementById('click-button');
        clickButton.addEventListener('click', (e) => {
            this.handleClick(e);
        });

        // Auto income collect
        document.getElementById('collect-auto').addEventListener('click', () => {
            this.collectAutoIncome();
        });

        // Profile actions
        document.getElementById('transfer-btn').addEventListener('click', () => {
            this.showTransferModal();
        });

        document.getElementById('prestige-btn').addEventListener('click', () => {
            this.showPrestigeModal();
        });

        document.getElementById('transactions-btn').addEventListener('click', () => {
            this.showTransactionsModal();
        });

        // Leaderboard tabs
        document.querySelectorAll('.lb-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                this.loadLeaderboard(type);
                
                // Update active tab
                document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });

        // Modal close
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeModal();
            }
        });
    }

    async login() {
        try {
            // Get Telegram Web App init data
            let initData = '';
            if (window.Telegram && window.Telegram.WebApp) {
                initData = window.Telegram.WebApp.initData;
            }

            // For development, create mock data if no Telegram data
            if (!initData) {
                initData = 'user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Test%22%2C%22username%22%3A%22testuser%22%7D';
            }

            const response = await this.apiCall('/auth/login', 'POST', { initData });
            
            if (response.success) {
                this.token = response.token;
                this.user = response.user;
                this.updateUI();
                return true;
            } else {
                throw new Error(response.error || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async loadGameData() {
        try {
            // Load upgrades
            const upgradesResponse = await this.apiCall('/game/upgrades');
            if (upgradesResponse.success) {
                this.upgrades = upgradesResponse.upgrades;
                this.renderUpgrades();
            }

            // Load businesses
            const businessResponse = await this.apiCall('/business');
            if (businessResponse.success) {
                this.businesses = businessResponse.businesses;
                this.renderBusinesses();
            }

            // Load achievements
            await this.loadAchievements();

            // Load leaderboard
            await this.loadLeaderboard('coins');

        } catch (error) {
            console.error('Error loading game data:', error);
        }
    }

    async handleClick(event) {
        try {
            // Create click effect
            this.createClickEffect(event);

            const response = await this.apiCall('/game/click', 'POST', { clicks: 1 });
            
            if (response.success) {
                // Update user data
                this.user.coins = response.totalCoins;
                this.user.experience = response.experience;
                this.user.level = response.level;
                this.user.total_clicks = (this.user.total_clicks || 0) + 1;

                // Update UI
                this.updateUI();

                // Show earned coins
                this.showFloatingText(`+${response.earnedCoins}`, event.target);

                // Check for level up
                if (response.newLevel) {
                    this.showMessage(`🎉 Поздравляем! Вы достигли ${response.newLevel} уровня!`, 'success');
                }
            }
        } catch (error) {
            console.error('Click error:', error);
        }
    }

    async purchaseUpgrade(upgradeId) {
        try {
            const response = await this.apiCall(`/game/upgrade/${upgradeId}`, 'POST');
            
            if (response.success) {
                this.user.coins = response.remainingCoins;
                this.showMessage('Улучшение куплено!', 'success');
                
                // Reload upgrades and user data
                await this.loadGameData();
                await this.refreshUserData();
            } else {
                this.showMessage(response.error || 'Ошибка покупки', 'error');
            }
        } catch (error) {
            console.error('Purchase upgrade error:', error);
            this.showMessage('Ошибка покупки улучшения', 'error');
        }
    }

    async purchaseBusiness(businessId) {
        try {
            const response = await this.apiCall(`/business/${businessId}/purchase`, 'POST');
            
            if (response.success) {
                this.user.coins = response.remainingCoins;
                this.showMessage('Бизнес куплен!', 'success');
                
                // Reload businesses
                await this.loadGameData();
            } else {
                this.showMessage(response.error || 'Ошибка покупки', 'error');
            }
        } catch (error) {
            console.error('Purchase business error:', error);
            this.showMessage('Ошибка покупки бизнеса', 'error');
        }
    }

    async collectAutoIncome() {
        try {
            const response = await this.apiCall('/game/collect-auto', 'POST');
            
            if (response.success && response.earned > 0) {
                this.user.coins = (this.user.coins || 0) + response.earned;
                this.updateUI();
                this.showMessage(`Собрано ${response.earned} монет за ${response.hoursOffline} часов!`, 'success');
                
                // Hide collect button
                document.getElementById('collect-auto').style.display = 'none';
            }
        } catch (error) {
            console.error('Collect auto income error:', error);
        }
    }

    async loadLeaderboard(type) {
        try {
            const response = await this.apiCall(`/leaderboard/${type}`);
            
            if (response.success) {
                this.renderLeaderboard(response.leaderboard, response.userRank);
            }
        } catch (error) {
            console.error('Load leaderboard error:', error);
        }
    }

    async loadAchievements() {
        try {
            const response = await this.apiCall('/user/achievements');
            
            if (response.success) {
                this.renderAchievements(response.achievements);
            }
        } catch (error) {
            console.error('Load achievements error:', error);
        }
    }

    async refreshUserData() {
        try {
            const response = await this.apiCall('/user/profile');
            
            if (response.success) {
                this.user = response.user;
                this.updateUI();
            }
        } catch (error) {
            console.error('Refresh user data error:', error);
        }
    }

    switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;

        // Load tab-specific data
        if (tabName === 'leaderboard') {
            this.loadLeaderboard('coins');
        } else if (tabName === 'profile') {
            this.loadAchievements();
        }
    }

    updateUI() {
        if (!this.user) return;

        // Update header
        document.getElementById('user-name').textContent = this.user.username || this.user.first_name || 'Player';
        document.getElementById('user-level').textContent = this.user.level || 1;
        document.getElementById('coins-amount').textContent = this.formatNumber(this.user.coins || 0);
        document.getElementById('gems-amount').textContent = this.user.gems || 0;

        // Update clicker tab
        document.getElementById('click-power').textContent = this.user.click_power || 1;
        document.getElementById('auto-income').textContent = this.formatNumber(this.user.auto_income || 0);
        document.getElementById('total-clicks').textContent = this.formatNumber(this.user.total_clicks || 0);
        document.getElementById('total-earned').textContent = this.formatNumber(this.user.total_earned || 0);

        // Update experience bar
        const currentExp = this.user.experience || 0;
        const currentLevel = this.user.level || 1;
        const expForCurrentLevel = Math.pow(currentLevel - 1, 2) * 100;
        const expForNextLevel = Math.pow(currentLevel, 2) * 100;
        const expProgress = ((currentExp - expForCurrentLevel) / (expForNextLevel - expForCurrentLevel)) * 100;

        document.getElementById('current-exp').textContent = currentExp - expForCurrentLevel;
        document.getElementById('next-level-exp').textContent = expForNextLevel - expForCurrentLevel;
        document.getElementById('exp-progress').style.width = Math.max(0, Math.min(100, expProgress)) + '%';

        // Update profile tab
        document.getElementById('profile-name').textContent = this.user.username || this.user.first_name || 'Player';
        document.getElementById('profile-level').textContent = this.user.level || 1;
        document.getElementById('profile-prestige').textContent = this.user.prestige_level || 0;

        // Show auto income collect button if there's offline income
        if (this.user.auto_income > 0) {
            const lastActive = new Date(this.user.last_active || Date.now());
            const now = new Date();
            const hoursDiff = (now - lastActive) / (1000 * 60 * 60);
            
            if (hoursDiff >= 1) {
                document.getElementById('collect-auto').style.display = 'inline-block';
            }
        }
    }

    renderUpgrades() {
        const container = document.getElementById('upgrades-list');
        container.innerHTML = '';

        this.upgrades.forEach(upgrade => {
            const canAfford = (this.user.coins || 0) >= upgrade.current_cost;
            const isMaxLevel = upgrade.max_level && upgrade.user_level >= upgrade.max_level;

            const upgradeEl = document.createElement('div');
            upgradeEl.className = 'upgrade-item';
            upgradeEl.innerHTML = `
                <div class="upgrade-info">
                    <div class="upgrade-name">
                        ${upgrade.icon} ${upgrade.name}
                    </div>
                    <div class="upgrade-description">${upgrade.description}</div>
                    <div class="upgrade-level">Уровень: ${upgrade.user_level}</div>
                    <div class="upgrade-cost">${this.formatNumber(upgrade.current_cost)} монет</div>
                </div>
                <button class="buy-btn" ${!canAfford || isMaxLevel ? 'disabled' : ''} 
                        onclick="game.purchaseUpgrade(${upgrade.id})">
                    ${isMaxLevel ? 'МАКС' : 'Купить'}
                </button>
            `;
            container.appendChild(upgradeEl);
        });
    }

    renderBusinesses() {
        const container = document.getElementById('business-list');
        container.innerHTML = '';

        this.businesses.forEach(business => {
            const canAfford = (this.user.coins || 0) >= business.current_cost;
            const isUnlocked = business.unlocked;

            const businessEl = document.createElement('div');
            businessEl.className = 'business-item';
            businessEl.innerHTML = `
                <div class="business-info">
                    <div class="business-name">
                        ${business.icon} ${business.name}
                    </div>
                    <div class="business-description">${business.description}</div>
                    <div class="business-level">Уровень: ${business.user_level}</div>
                    <div class="business-cost">${this.formatNumber(business.current_cost)} монет</div>
                    <div class="business-income">Доход: ${this.formatNumber(business.current_income)}/час</div>
                </div>
                <button class="buy-btn" ${!canAfford || !isUnlocked ? 'disabled' : ''} 
                        onclick="game.purchaseBusiness(${business.id})">
                    ${!isUnlocked ? `Ур. ${business.unlock_level}` : 'Купить'}
                </button>
            `;
            container.appendChild(businessEl);
        });
    }

    renderLeaderboard(leaderboard, userRank) {
        const container = document.getElementById('leaderboard-list');
        container.innerHTML = '';

        leaderboard.forEach((player, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            
            const playerEl = document.createElement('div');
            playerEl.className = 'leaderboard-item';
            playerEl.innerHTML = `
                <div class="rank ${rankClass}">${player.rank}</div>
                <div class="player-info">
                    <div class="player-name">${player.display_name}</div>
                    <div class="player-stats">
                        Уровень: ${player.level} | Монеты: ${this.formatNumber(player.coins)}
                        ${player.prestige_level > 0 ? ` | Престиж: ${player.prestige_level}` : ''}
                    </div>
                </div>
            `;
            container.appendChild(playerEl);
        });

        // Show user rank if not in top list
        if (userRank && userRank > leaderboard.length) {
            const userRankEl = document.createElement('div');
            userRankEl.className = 'leaderboard-item';
            userRankEl.style.borderTop = '2px solid #4facfe';
            userRankEl.innerHTML = `
                <div class="rank">${userRank}</div>
                <div class="player-info">
                    <div class="player-name">Вы</div>
                    <div class="player-stats">Ваша позиция в рейтинге</div>
                </div>
            `;
            container.appendChild(userRankEl);
        }
    }

    renderAchievements(achievements) {
        const container = document.getElementById('achievements-list');
        container.innerHTML = '';

        achievements.forEach(achievement => {
            const achievementEl = document.createElement('div');
            achievementEl.className = `achievement-item ${achievement.earned ? 'earned' : ''}`;
            achievementEl.innerHTML = `
                <div class="achievement-icon">${achievement.icon}</div>
                <div class="achievement-name">${achievement.name}</div>
            `;
            achievementEl.title = achievement.description;
            container.appendChild(achievementEl);
        });
    }

    showTransferModal() {
        const modalContent = `
            <h3>💸 Перевод монет</h3>
            <form id="transfer-form">
                <div class="mb-3">
                    <label>ID получателя:</label>
                    <input type="number" id="recipient-id" required>
                </div>
                <div class="mb-3">
                    <label>Сумма:</label>
                    <input type="number" id="transfer-amount" min="1" required>
                </div>
                <div class="mb-3">
                    <small>Доступно: ${this.formatNumber(this.user.coins)} монет</small>
                </div>
                <button type="submit" class="buy-btn">Перевести</button>
                <button type="button" class="buy-btn" onclick="game.closeModal()" style="background: #6c757d; margin-left: 10px;">Отмена</button>
            </form>
        `;
        
        this.showModal(modalContent);
        
        document.getElementById('transfer-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const recipientId = document.getElementById('recipient-id').value;
            const amount = parseFloat(document.getElementById('transfer-amount').value);
            
            try {
                const response = await this.apiCall('/user/transfer', 'POST', {
                    recipientId: parseInt(recipientId),
                    amount: amount
                });
                
                if (response.success) {
                    this.user.coins = response.remainingCoins;
                    this.updateUI();
                    this.showMessage('Перевод выполнен успешно!', 'success');
                    this.closeModal();
                } else {
                    this.showMessage(response.error || 'Ошибка перевода', 'error');
                }
            } catch (error) {
                this.showMessage('Ошибка перевода', 'error');
            }
        });
    }

    showPrestigeModal() {
        const minLevel = 50;
        const canPrestige = (this.user.level || 1) >= minLevel;
        const prestigePoints = Math.floor((this.user.level || 1) / 10);
        
        const modalContent = `
            <h3>👑 Перерождение</h3>
            <p>Перерождение сбросит ваш прогресс, но даст постоянные бонусы:</p>
            <ul>
                <li>+2 к силе клика за каждый уровень престижа</li>
                <li>+5 к автоматическому доходу за каждый уровень престижа</li>
                <li>1000 стартовых монет</li>
                <li>+${prestigePoints} очков престижа</li>
            </ul>
            <p><strong>Требуется уровень ${minLevel}</strong></p>
            <p>Ваш уровень: ${this.user.level || 1}</p>
            
            ${canPrestige ? `
                <button class="prestige-btn" onclick="game.performPrestige()">Переродиться</button>
            ` : `
                <p style="color: #dc3545;">Недостаточно уровня для перерождения</p>
            `}
            <button class="buy-btn" onclick="game.closeModal()" style="background: #6c757d; margin-left: 10px;">Отмена</button>
        `;
        
        this.showModal(modalContent);
    }

    async performPrestige() {
        try {
            const response = await this.apiCall('/user/prestige', 'POST');
            
            if (response.success) {
                this.showMessage('Перерождение выполнено успешно!', 'success');
                await this.refreshUserData();
                await this.loadGameData();
                this.closeModal();
            } else {
                this.showMessage(response.error || 'Ошибка перерождения', 'error');
            }
        } catch (error) {
            this.showMessage('Ошибка перерождения', 'error');
        }
    }

    showTransactionsModal() {
        // This would show transaction history - simplified for now
        const modalContent = `
            <h3>📊 История транзакций</h3>
            <p>Функция в разработке...</p>
            <button class="buy-btn" onclick="game.closeModal()">Закрыть</button>
        `;
        
        this.showModal(modalContent);
    }

    showModal(content) {
        document.getElementById('modal-content').innerHTML = content;
        document.getElementById('modal-overlay').classList.add('active');
    }

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('active');
    }

    createClickEffect(event) {
        const rect = event.target.getBoundingClientRect();
        const effect = document.createElement('div');
        effect.className = 'click-effect';
        effect.textContent = `+${this.user.click_power || 1}`;
        effect.style.left = (rect.left + rect.width / 2) + 'px';
        effect.style.top = (rect.top + rect.height / 2) + 'px';
        effect.style.position = 'fixed';
        
        document.body.appendChild(effect);
        
        setTimeout(() => {
            document.body.removeChild(effect);
        }, 600);
    }

    showFloatingText(text, element) {
        const rect = element.getBoundingClientRect();
        const floating = document.createElement('div');
        floating.className = 'click-effect';
        floating.textContent = text;
        floating.style.left = (rect.left + rect.width / 2) + 'px';
        floating.style.top = rect.top + 'px';
        floating.style.position = 'fixed';
        
        document.body.appendChild(floating);
        
        setTimeout(() => {
            if (document.body.contains(floating)) {
                document.body.removeChild(floating);
            }
        }, 600);
    }

    showMessage(message, type = 'info') {
        const messageEl = document.createElement('div');
        messageEl.className = `floating-message ${type}`;
        messageEl.textContent = message;
        
        document.getElementById('floating-messages').appendChild(messageEl);
        
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 3000);
    }

    startAutoIncomeCheck() {
        // Check for auto income every 30 seconds
        this.autoIncomeInterval = setInterval(() => {
            if (this.user && this.user.auto_income > 0) {
                const lastActive = new Date(this.user.last_active || Date.now());
                const now = new Date();
                const hoursDiff = (now - lastActive) / (1000 * 60 * 60);
                
                if (hoursDiff >= 1) {
                    document.getElementById('collect-auto').style.display = 'inline-block';
                }
            }
        }, 30000);
    }

    formatNumber(num) {
        if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
        if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return Math.floor(num).toString();
    }

    async apiCall(endpoint, method = 'GET', data = null) {
        const url = this.apiBase + endpoint;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (this.token) {
            options.headers.Authorization = `Bearer ${this.token}`;
        }

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        return await response.json();
    }
}

// Initialize game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new ClickerGame();
});

// Make game globally accessible for onclick handlers
window.game = game;
