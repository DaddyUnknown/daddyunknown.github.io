import React, { useState, useEffect } from 'react';
import { MantineProvider, Container, Button, Text, Grid, Card, Image, Badge, Group } from '@mantine/core';

function App() {
  const [user, setUser] = useState(null);
  const [clicks, setClicks] = useState(0);
  const [coins, setCoins] = useState(0);
  const [upgrades, setUpgrades] = useState([]);
  const telegram = window.Telegram.WebApp;

  useEffect(() => {
    // Инициализация пользователя
    const initUser = async () => {
      try {
        const response = await fetch('/api/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: telegram.initDataUnsafe.user.id,
            username: telegram.initDataUnsafe.user.username
          })
        });
        const data = await response.json();
        setUser(data);
      } catch (error) {
        console.error('Error initializing user:', error);
      }
    };

    // Загрузка улучшений
    const loadUpgrades = async () => {
      try {
        const response = await fetch('/api/upgrades');
        const data = await response.json();
        setUpgrades(data);
      } catch (error) {
        console.error('Error loading upgrades:', error);
      }
    };

    initUser();
    loadUpgrades();
    telegram.ready();
  }, []);

  const handleClick = async () => {
    try {
      const response = await fetch('/api/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: telegram.initDataUnsafe.user.id })
      });
      const data = await response.json();
      setClicks(data.clicks);
      setCoins(data.coins);
    } catch (error) {
      console.error('Error processing click:', error);
    }
  };

  const handleBuyUpgrade = async (upgradeId) => {
    try {
      const response = await fetch('/api/buy-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: telegram.initDataUnsafe.user.id,
          upgradeId
        })
      });
      if (response.ok) {
        // Обновляем состояние после покупки
        const userResponse = await fetch('/api/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: telegram.initDataUnsafe.user.id })
        });
        const userData = await userResponse.json();
        setCoins(userData.coins);
      }
    } catch (error) {
      console.error('Error buying upgrade:', error);
    }
  };

  return (
    <MantineProvider>
      <Container size="lg" py="xl">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Text size="xl" weight={700} mb="md">
            Кликер
          </Text>
          <Text size="lg" mb="xl">
            Монеты: {coins} | Клики: {clicks}
          </Text>
          <Button
            size="xl"
            radius="xl"
            variant="gradient"
            gradient={{ from: 'indigo', to: 'cyan' }}
            onClick={handleClick}
            style={{ marginBottom: '2rem' }}
          >
            Кликнуть!
          </Button>
        </div>

        <Text size="xl" weight={700} mb="md">
          Магазин улучшений
        </Text>
        <Grid>
          {upgrades.map((upgrade) => (
            <Grid.Col key={upgrade.id} span={6}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Card.Section>
                  <Image
                    src={upgrade.image_url}
                    height={160}
                    alt={upgrade.name}
                  />
                </Card.Section>

                <Group position="apart" mt="md" mb="xs">
                  <Text weight={500}>{upgrade.name}</Text>
                  <Badge color="pink" variant="light">
                    {upgrade.cost} монет
                  </Badge>
                </Group>

                <Text size="sm" color="dimmed">
                  {upgrade.description}
                </Text>

                <Button
                  variant="light"
                  color="blue"
                  fullWidth
                  mt="md"
                  radius="md"
                  onClick={() => handleBuyUpgrade(upgrade.id)}
                  disabled={coins < upgrade.cost}
                >
                  Купить
                </Button>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      </Container>
    </MantineProvider>
  );
}

export default App; 