import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select, { SingleValue } from 'react-select';
import './styles.css';

interface Usage {
    created_at: string;
    type: string;
    model: string;
    usage_input: string;
    usage_output: string;
}

interface Cost {
    model: string;
    input: string;
    output: string;
}

interface Option {
    value: string;
    label: string;
}

const parseDate = (dateString: string): Date => {
    const [day, month, year] = dateString.split('.');
    return new Date(`${year}-${month}-${day}`);
}

const formatDate = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

const App: React.FC = () => {
    const [usages, setUsages] = useState<Usage[]>([]);
    const [costs, setCosts] = useState<Cost[]>([]);
    const [selectedType, setSelectedType] = useState<Option | null>(null);
    const [selectedModel, setSelectedModel] = useState<Option | null>(null);
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const [endDate, setEndDate] = useState<Date | undefined>(undefined);

    useEffect(() => {
        Promise.all([
            fetch('/assets/usages.csv').then(response => response.text()),
            fetch('/assets/costs.csv').then(response => response.text())
        ])
            .then(([usagesText, costsText]) => {
                Papa.parse(usagesText, {
                    header: true,
                    complete: (result) => {
                        const sortedUsages = result.data.map((usage: unknown) => {
                            return ({
                                ...usage as Usage,
                                created_at: formatDate(parseDate((usage as Usage).created_at))
                            });
                        }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                        setUsages(sortedUsages);
                    },
                });
                Papa.parse(costsText, {
                    header: true,
                    complete: (result) => {
                        setCosts(result.data as Cost[]);
                    },
                });
            })
            .catch(error => console.error('Error fetching CSV files:', error));
    }, []);

    const calculateTotalCost = useMemo(() => {
        const modelCosts: { [key: string]: { input: number; output: number } } = {};
        costs.forEach((cost) => {
            modelCosts[cost.model] = {
                input: parseFloat(cost.input),
                output: parseFloat(cost.output),
            };
        });

        return (usage: Usage) => {
            const modelCost = modelCosts[usage.model];
            if (!modelCost) return 0;
            return (
                modelCost.input * parseFloat(usage.usage_input) +
                modelCost.output * parseFloat(usage.usage_output)
            );
        };
    }, [costs]);

    const filteredUsages = useMemo(() => {
        return usages.filter((usage) => {
            const usageDate = parseDate(usage.created_at);
            return (
                (!selectedType || usage.type === selectedType.value) &&
                (!selectedModel || usage.model === selectedModel.value) &&
                (!startDate || usageDate >= startDate) &&
                (!endDate || usageDate <= endDate)
            );
        });
    }, [usages, selectedType, selectedModel, startDate, endDate]);

    const groupByDay = useMemo(() => {
        const dailyCosts: { [key: string]: number } = {};
        filteredUsages.forEach((usage) => {
            const date = usage.created_at;
            const cost = calculateTotalCost(usage);

            if (date && date in dailyCosts) {
                dailyCosts[date] += cost;
            } else {
                dailyCosts[date] = cost;
            }
        });

        return Object.keys(dailyCosts).map((date) => ({
            date,
            cost: dailyCosts[date],
        })).sort((a, b) => {
            const dateA = parseDate(a.date);
            const dateB = parseDate(b.date);
            return dateA.getTime() - dateB.getTime();
        });
    }, [filteredUsages, calculateTotalCost]);

    const chartData = useMemo(() => ({
        labels: groupByDay.map((entry) => entry.date),
        datasets: [
            {
                label: 'Daily usage',
                data: groupByDay.map((entry) => entry.cost),
                backgroundColor: 'rgb(17,100,102)',
                borderColor: 'rgba(75,192,192,1)',
            },
        ],
    }), [groupByDay]);

    const minDate = useMemo(() => {
        if (groupByDay.length > 0) {
            return parseDate(groupByDay[0].date);
        }
        return undefined;
    }, [groupByDay]);

    const maxDate = useMemo(() => {
        if (groupByDay.length > 0) {
            return parseDate(groupByDay[groupByDay.length - 1].date);
        }
        return undefined;
    }, [groupByDay]);

    const types = useMemo(() => [...new Set(usages.map((usage) => usage.type))].map(type => ({ value: type, label: type })), [usages]);
    const models = useMemo(() => [...new Set(usages.map((usage) => usage.model))].map(model => ({ value: model, label: model })), [usages]);

    if (!usages.length || !costs.length) return <div>Loading...</div>;
    if (usages.length === 0 || costs.length === 0) return <div>No data available.</div>;

    return (
        <div className="App">
            <div className="filters">
                <Select
                    value={selectedType}
                    onChange={(selectedOption: SingleValue<Option>) => setSelectedType(selectedOption)}
                    options={types}
                    placeholder="Choose a type"
                    className="filter-select"
                />
                <Select
                    value={selectedModel}
                    onChange={(selectedOption: SingleValue<Option>) => setSelectedModel(selectedOption)}
                    options={models}
                    placeholder="Choose a model"
                    className="filter-select"
                />
                <DatePicker
                    selected={startDate}
                    onChange={(date: Date | null) => setStartDate(date || undefined)}
                    selectsStart
                    startDate={startDate}
                    endDate={endDate}
                    minDate={minDate}
                    maxDate={maxDate}
                    dateFormat="dd.MM.yyyy"
                    placeholderText="Start date"
                    className="date-picker"
                />
                <DatePicker
                    selected={endDate}
                    onChange={(date: Date | null) => setEndDate(date || undefined)}
                    selectsEnd
                    startDate={startDate}
                    endDate={endDate}
                    minDate={startDate}
                    maxDate={maxDate}
                    dateFormat="dd.MM.yyyy"
                    placeholderText="End date"
                    className="date-picker"
                />
            </div>
            <hr className="divider" />
            <Line data={chartData} />
        </div>
    );
}

export default App;