import Card from '../base/Card';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'teal' | 'emerald' | 'amber' | 'red' | 'blue';
}

function StatCard({ title, value, icon, trend, color = 'teal' }: StatCardProps) {
  const colors = {
    teal: 'bg-teal-100 text-teal-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    red: 'bg-red-100 text-red-600',
    blue: 'bg-blue-100 text-blue-600'
  };

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-slate-600 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-slate-900 mb-2">{value}</h3>
          {trend && (
            <div className="flex items-center gap-1">
              <i className={`ri-arrow-${trend.isPositive ? 'up' : 'down'}-line text-sm w-4 h-4 flex items-center justify-center ${trend.isPositive ? 'text-emerald-600' : 'text-red-600'}`}></i>
              <span className={`text-sm font-medium ${trend.isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                {trend.value}%
              </span>
              <span className="text-sm text-slate-500">vs mes anterior</span>
            </div>
          )}
        </div>
        <div className={`w-12 h-12 flex items-center justify-center rounded-lg ${colors[color]}`}>
          <i className={`${icon} text-2xl`}></i>
        </div>
      </div>
    </Card>
  );
}

export { StatCard };
export default StatCard;