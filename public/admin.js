// public/admin.js

let chartInstance = null;

async function fetchMetrics() {
  try {
    const response = await fetch('/api/v1/analytics/dashboard');
    const { data } = await response.json();

    // Update Cards
    document.getElementById('val-dau').innerText = data.dau;
    document.getElementById('val-onboarding').innerText = `${data.onboardingCompletionRate}%`;
    document.getElementById('val-focus').innerText = `${data.focusCompletionRate}%`;
    document.getElementById('val-duration').innerText = `${data.avgSessionDuration}s`;
    document.getElementById('val-ai').innerText = data.aiInteractionCount;

    // Update Chart
    renderChart(data.featureUsage);

  } catch (error) {
    console.error('Error fetching analytics:', error);
    alert('Failed to load analytics dashboard.');
  }
}

function renderChart(featureUsage) {
  const ctx = document.getElementById('featureChart').getContext('2d');
  
  const labels = featureUsage.map(f => f._id);
  const data = featureUsage.map(f => f.count);

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Event Count',
        data,
        backgroundColor: 'rgba(94, 106, 210, 0.6)',
        borderColor: '#5e6ad2',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#888' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#888' }
        }
      }
    }
  });
}

// Fetch on load
document.addEventListener('DOMContentLoaded', fetchMetrics);
